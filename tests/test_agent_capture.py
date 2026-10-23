"""Recorder integrity tests. These fixtures are NOT live model canaries."""

import importlib.util
import fcntl
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "agent_capture.py"
SID = "aaaaaaaa-1111-2222-3333-444444444444"
STAMP = "2026-10-23T09:00:00.000Z"


def row(kind, payload, timestamp=STAMP):
    return {"timestamp": timestamp, "type": kind, "payload": payload}


def session(repo, sid=SID):
    return [row("session_meta", {
        "id": sid, "timestamp": STAMP, "cwd": str(repo), "source": "vscode",
    })]


def turn(prompt, answer, model="gpt-6.1-sol", turn_id="turn-one", timestamp=STAMP):
    meta = {"turn_id": turn_id, "content_item_kinds": ["user.text"]}
    return [
        row("event_msg", {"type": "task_started", "turn_id": turn_id}),
        row("response_item", {
            "type": "message", "role": "user",
            "internal_chat_message_metadata_passthrough": meta,
            "content": [{"type": "input_text", "text": prompt}],
        }, timestamp),
        row("turn_context", {"turn_id": turn_id, "model": model}),
        row("response_item", {
            "type": "message", "role": "assistant", "phase": "final_answer",
            "internal_chat_message_metadata_passthrough": {"turn_id": turn_id},
            "content": [{"type": "output_text", "text": answer}],
        }, timestamp),
        row("event_msg", {
            "type": "task_complete", "turn_id": turn_id,
            "last_agent_message": answer,
        }, timestamp),
    ]


def write_rows(path, rows):
    with path.open("w", encoding="utf-8", newline="") as f:
        for record in rows:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")


class CaptureTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(SCRIPT.is_file(), "The automatic recorder is not implemented")
        spec = importlib.util.spec_from_file_location("agent_capture", SCRIPT)
        self.capture = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.capture)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        (self.repo / ".agent-capture.json").write_text(json.dumps({
            "author": "test-author", "name": "Test Person", "project": "test-project",
            "model": "gpt-6.1-sol", "poll_seconds": 0.05,
        }))
        self.sources = self.root / "transcripts"
        self.sources.mkdir()
        self.source = self.sources / "rollout.jsonl"

    def sync(self):
        return self.capture.sync(self.repo, self.sources)

    def log(self):
        return next((self.repo / ".agent-logs").glob("*.md"))

    def test_verbatim_text_and_only_user_prompts_and_final_answers(self):
        # A broad role-only filter would leak tools, progress, or injected context.
        prompt = "  Keep spacing.\n\nUnicode — café\r\nTrailing spaces  \n"
        answer = "Full answer.\n\n```text\nunchanged\n```\n"
        rows = session(self.repo)
        rows.append(row("response_item", {
            "type": "message", "role": "user",
            "internal_chat_message_metadata_passthrough": {
                "content_item_kinds": ["agents_md.instructions", "environments.environment_context"],
            },
            "content": [{"type": "input_text", "text": "INJECTED_CONTEXT"}],
        }))
        rows += turn(prompt, answer)
        rows[4:4] = [
            row("response_item", {"type": "reasoning", "text": "PRIVATE_REASONING"}),
            row("response_item", {"type": "function_call_output", "output": "TOOL_OUTPUT"}),
            row("response_item", {
                "type": "message", "role": "assistant", "phase": "commentary",
                "content": [{"type": "output_text", "text": "PROGRESS_UPDATE"}],
            }),
        ]
        write_rows(self.source, rows)
        self.sync()
        raw = self.log().read_bytes()
        self.assertIn(prompt.encode(), raw)
        self.assertIn(answer.encode(), raw)
        for forbidden in (b"INJECTED_CONTEXT", b"PRIVATE_REASONING", b"TOOL_OUTPUT", b"PROGRESS_UPDATE"):
            self.assertNotIn(forbidden, raw)
        self.assertEqual(raw.count(b"[LOG_ENTRY type=PROMPT"), 1)
        self.assertEqual(raw.count(b"[LOG_ENTRY type=RESPONSE"), 1)

    def test_replay_preserves_entries_and_records_a_model_switch(self):
        # Losing idempotence duplicates exchanges; recomputing old bodies edits history.
        rows = session(self.repo) + turn("Original prompt", "Original final")
        write_rows(self.source, rows)
        self.sync()
        before = self.log().read_bytes()
        body_before = before.split(b"\n---\n", 1)[1]
        self.sync()
        self.assertEqual(before, self.log().read_bytes())
        rows += turn("Next prompt", "Next final", model="different-model",
                     turn_id="turn-two", timestamp="2026-10-23T10:00:00.000Z")
        write_rows(self.source, rows)
        self.sync()
        after = self.log().read_bytes()
        self.assertTrue(after.split(b"\n---\n", 1)[1].startswith(body_before))
        self.assertEqual(after.count(b"[LOG_ENTRY type=PROMPT"), 2)
        self.assertEqual(after.count(b"[LOG_ENTRY type=RESPONSE"), 2)
        self.assertIn(b"model: different-model", after)
        self.assertIn(b"last_prompt_time: 2026-10-23T10:00:00.000Z", after)
        self.assertIn(b"total_exchanges: 2", after)

    def test_partial_record_is_retried_and_other_projects_are_excluded(self):
        # Consuming a partial JSONL record would permanently lose the final response.
        rows = session(self.repo) + turn("A real prompt", "A real final")
        write_rows(self.source, rows[:-2])
        pending = json.dumps(rows[-2], ensure_ascii=False).encode()
        with self.source.open("ab") as f:
            f.write(pending[:40])
        other = self.sources / "other.jsonl"
        write_rows(other, session(self.root / "other-project") + turn("UNRELATED", "UNRELATED"))
        self.sync()
        self.assertNotIn(b"type=RESPONSE", self.log().read_bytes())
        with self.source.open("ab") as f:
            f.write(pending[40:] + b"\n")
        self.sync()
        self.assertIn(b"A real final", self.log().read_bytes())
        self.assertEqual(len(list((self.repo / ".agent-logs").glob("*.md"))), 1)

    def test_changed_log_is_never_silently_rewritten(self):
        # Repair-by-regeneration would hide edits to already captured evidence.
        write_rows(self.source, session(self.repo) + turn("Original", "Answer"))
        self.sync()
        path = self.log()
        changed = path.read_bytes().replace(b"Original", b"Tampered")
        path.write_bytes(changed)
        with self.assertRaises(ValueError):
            self.sync()
        self.assertEqual(path.read_bytes(), changed)

    def test_watcher_detects_two_sessions_without_per_turn_commands(self):
        # A recorder that only runs on startup misses later sessions and responses.
        process = subprocess.Popen([
            sys.executable, str(SCRIPT), "watch", "--repo", str(self.repo),
            "--sessions-root", str(self.sources),
        ], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        try:
            write_rows(self.source, session(self.repo) + turn("Session one", "Final one"))
            second = self.sources / "second.jsonl"
            write_rows(second, session(self.repo, "bbbbbbbb-1111-2222-3333-444444444444")
                       + turn("Session two", "Final two"))
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline:
                logs = list((self.repo / ".agent-logs").glob("*.md"))
                if len(logs) == 2 and all(b"type=RESPONSE" in p.read_bytes() for p in logs):
                    break
                if process.poll() is not None:
                    self.fail(process.stderr.read().decode())
                time.sleep(0.05)
            else:
                self.fail("Watcher did not automatically capture both sessions")
        finally:
            if process.poll() is None:
                process.terminate()
            process.wait(timeout=5)
            process.stderr.close()

    def test_verifier_does_not_count_a_canary_quoted_inside_instructions(self):
        # Substring matching would falsely pass on the setup prompt itself.
        canary = "CAPTURE TEST — 8x assignment, Test Person"
        write_rows(self.source, session(self.repo) + turn("Instructions mentioning " + canary, "Read"))
        self.sync()
        result = self.capture.verify(self.repo, self.sources)
        self.assertFalse(result["passed"])
        self.assertEqual(result["verified_sessions"], [])

    def test_status_recognizes_a_watcher_in_another_process_namespace(self):
        # PIDs differ between managed command namespaces; a live lock is shared.
        state = self.repo / ".agent-capture-state"
        state.mkdir()
        (state / "status.json").write_text(json.dumps({
            "pid": 2147483647, "last_scan_utc": self.capture.utc_now(), "error": None,
        }))
        with (state / "watch.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.assertTrue(self.capture.status(self.repo)["running"])
        self.assertFalse(self.capture.status(self.repo)["running"])

    def test_successful_verification_pastes_both_raw_pairs_and_keeps_failures(self):
        # A PASS without two distinct source-backed pairs would falsify the proof.
        prompt = "CAPTURE TEST — 8x assignment, Test Person"
        write_rows(self.source, session(self.repo) + turn(prompt, "First fixture final"))
        second = self.sources / "second.jsonl"
        write_rows(second, session(self.repo, "bbbbbbbb-1111-2222-3333-444444444444")
                   + turn(prompt, "Second fixture final"))
        proof = self.repo / "CAPTURE-TEST.md"
        proof.write_text("Status: PENDING\n\n## Attempts and limitations\n\nKeep this failed attempt.\n")
        result = self.capture.verify(self.repo, self.sources)
        self.assertTrue(result["passed"])
        self.assertEqual(len(result["verified_sessions"]), 2)
        self.capture.publish_proof(self.repo, result)
        text = proof.read_text()
        self.assertIn("Status: **PASS**", text)
        self.assertIn("Keep this failed attempt.", text)
        self.assertEqual(text.count("[LOG_ENTRY type=PROMPT"), 2)
        self.assertEqual(text.count("[LOG_ENTRY type=RESPONSE"), 2)
        self.assertIn("First fixture final", text)
        self.assertIn("Second fixture final", text)


if __name__ == "__main__":
    unittest.main()
