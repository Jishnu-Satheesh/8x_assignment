#!/usr/bin/env python3
"""Automatically project Codex transcripts into immutable prompt/final entries.

Only the Python standard library is used. Raw Codex transcripts stay outside the
submission; reasoning, tools, injected context, and commentary are never exported.
"""

import argparse
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time


DEFAULT_REPO = Path(__file__).resolve().parents[1]


def config(repo):
    return json.loads((repo / ".agent-capture.json").read_text(encoding="utf-8"))


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def utc_stamp(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def default_sessions():
    # Read the existing setting; never relocate the user's Codex home or auth.
    return Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex"))) / "sessions"


def records(path):
    with path.open("rb") as source:
        for line in source:
            # Codex may be halfway through writing the final UTF-8/JSON record.
            if not line.endswith(b"\n"):
                break
            yield json.loads(line)


def read_session(path, repo):
    iterator = records(path)
    first = next(iterator, None)
    if not first or first.get("type") != "session_meta":
        return None
    meta = first["payload"]
    if not Path(meta.get("cwd", "/")).resolve().is_relative_to(repo):
        return None
    # Subagents are intermediate work, not human prompt/response exchanges.
    if isinstance(meta.get("source"), dict):
        return None

    rows = list(iterator)
    canonical_prompts = any(r.get("type") == "event_msg"
                            and r.get("payload", {}).get("type") == "user_message" for r in rows)
    active_turn = None
    models = {}
    prompts = []
    finals = []
    fallback_finals = []
    for index, record in enumerate(rows):
        payload = record.get("payload", {})
        record_type = record.get("type")
        kind = payload.get("type")
        metadata = payload.get("internal_chat_message_metadata_passthrough", {})
        turn_id = payload.get("turn_id") or metadata.get("turn_id") or active_turn
        if record_type == "event_msg" and kind in ("task_started", "turn_started"):
            active_turn = turn_id or f"turn-{index}"
            continue
        if record_type == "turn_context":
            active_turn = turn_id or active_turn
            if payload.get("model"):
                models[active_turn] = payload["model"]
            continue

        text = None
        entry_type = None
        if canonical_prompts and record_type == "event_msg" and kind == "user_message":
            text = payload.get("message")
            entry_type = "PROMPT"
        elif not canonical_prompts and record_type == "response_item" and kind == "message" \
                and payload.get("role") == "user":
            kinds = metadata.get("content_item_kinds", [])
            provenance = metadata.get("content_item_metadata", [])
            parts = []
            for i, part in enumerate(payload.get("content", [])):
                from_user = i < len(kinds) and kinds[i] == "user.text"
                from_user |= i < len(provenance) and provenance[i].get("provenance", {}).get("type") == "user"
                if from_user and part.get("type") == "input_text":
                    parts.append(part["text"])
            if parts:
                text = "".join(parts)
                entry_type = "PROMPT"
        elif record_type == "response_item" and kind == "message" \
                and payload.get("role") == "assistant" and payload.get("phase") in ("final_answer", "final"):
            text = "".join(p["text"] for p in payload.get("content", []) if p.get("type") == "output_text")
            entry_type = "RESPONSE"
        elif record_type == "event_msg" and kind in ("task_complete", "turn_complete"):
            if isinstance(payload.get("last_agent_message"), str):
                fallback_finals.append({"type": "RESPONSE", "turn_id": turn_id, "index": index,
                                        "timestamp": record["timestamp"], "text": payload["last_agent_message"]})

        if text is not None and entry_type:
            entry = {"type": entry_type, "turn_id": turn_id, "index": index,
                     "timestamp": record["timestamp"], "text": text}
            (prompts if entry_type == "PROMPT" else finals).append(entry)

    final_turns = {e["turn_id"] for e in finals}
    finals.extend(e for e in fallback_finals if e["turn_id"] not in final_turns)
    numbers = {}
    for entry in prompts:
        numbers.setdefault(entry["turn_id"], len(numbers) + 1)
    entries = []
    for entry in sorted(prompts + finals, key=lambda e: e["index"]):
        tid = entry["turn_id"]
        if tid not in numbers or tid not in models:
            # Wait for real runtime model metadata; never guess from config.
            continue
        entry.update(num=numbers[tid], model=models[tid])
        entries.append(entry)
    return meta, entries


def entry_block(entry, sid):
    return (f"[LOG_ENTRY type={entry['type']} num={entry['num']} session={sid[:8]}]\n"
            f"timestamp: {entry['timestamp']}\nmodel: {entry['model']}\n\n"
            + entry["text"] + "\n\n\n")


def render(meta, entries, settings):
    sid = meta["id"]
    stamp = utc_stamp(meta["timestamp"])
    prompts = [e for e in entries if e["type"] == "PROMPT"]
    first, last = prompts[0]["timestamp"], prompts[-1]["timestamp"]
    tool = "codex-vscode" if meta.get("source") == "vscode" else "codex-cli"
    # Fixed-width mutable metadata permits in-place updates without rewriting a
    # single byte of any previously captured entry.
    header = (f"---\nsession_id: {sid}\ndate: {stamp:%Y-%m-%d}\n"
              f"author: {settings['author']}\nmodel: {entries[0]['model']}\ntool: {tool}\n"
              f"project: {settings['project']}\ntotal_exchanges: {len({e['num'] for e in prompts}):<12}\n"
              f"first_prompt_time: {first}\nlast_prompt_time: {last:<40}\n---\n")
    body = (f"\n# Session Log - {stamp:%Y-%m-%d}\n\n"
            f"Session: `{sid[:8]}` | Project: `{settings['project']}` | Author: `{settings['author']}`\n\n---\n\n"
            + "".join(entry_block(e, sid) for e in entries))
    filename = f"{stamp:%Y-%m-%d_%H-%M-%S}_{sid}.md"
    return filename, header.encode("utf-8"), body.encode("utf-8")


def append_projection(path, header, body):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(path, os.O_CREAT | os.O_RDWR, 0o644)
    with os.fdopen(fd, "r+b") as target:
        fcntl.flock(target, fcntl.LOCK_EX)
        existing = target.read()
        if existing:
            end = existing.index(b"\n---\n", 4) + len(b"\n---\n")
            old_header, old_body = existing[:end], existing[end:]
            immutable = lambda h: [s for s in h.splitlines() if not s.startswith((b"total_exchanges:", b"last_prompt_time:"))]
            if len(old_header) != len(header) or immutable(old_header) != immutable(header):
                raise ValueError(f"Session metadata changed; refusing to rewrite {path}")
            if not body.startswith(old_body):
                raise ValueError(f"Captured entries differ from source; refusing to rewrite {path}")
            if old_body != body:
                target.seek(0, os.SEEK_END)
                target.write(body[len(old_body):])
            if old_header != header:
                target.seek(0)
                target.write(header)
        else:
            target.write(header + body)
        target.flush()
        os.fsync(target.fileno())


def sync(repo, sessions_root):
    repo = repo.resolve()
    settings = config(repo)
    captured = []
    for path in sorted(sessions_root.rglob("*.jsonl")):
        parsed = read_session(path, repo)
        if parsed is None:
            continue
        meta, entries = parsed
        if not any(e["type"] == "PROMPT" for e in entries):
            continue
        name, header, body = render(meta, entries, settings)
        log = repo / ".agent-logs" / name
        append_projection(log, header, body)
        captured.append({"meta": meta, "entries": entries, "log": log, "source": path})
    return captured


def verify(repo, sessions_root, captured=None):
    settings = config(repo)
    canary = f"CAPTURE TEST — 8x assignment, {settings['name']}"
    captured = sync(repo, sessions_root) if captured is None else captured
    verified = []
    seen = set()
    for item in captured:
        sid = item["meta"]["id"]
        if sid in seen:
            continue
        for prompt in item["entries"]:
            if prompt["type"] != "PROMPT" or prompt["text"] != canary:
                continue
            answer = next((e for e in item["entries"] if e["type"] == "RESPONSE"
                           and e["num"] == prompt["num"] and e["text"]), None)
            if answer:
                actual = item["log"].read_bytes()
                raw = [entry_block(e, sid) for e in (prompt, answer)]
                if all(block.encode("utf-8") in actual for block in raw):
                    verified.append({"session_id": sid, "log": str(item["log"].relative_to(repo)),
                                     "model": prompt["model"], "raw_entries": "".join(raw)})
                    seen.add(sid)
                    break
    return {"passed": len(verified) >= 2, "verified_sessions": verified}


def publish_proof(repo, result):
    if not result["passed"]:
        return
    proof = repo / "CAPTURE-TEST.md"
    # Install-time failures remain in the proof after verification turns green.
    previous = proof.read_text(encoding="utf-8") if proof.exists() else ""
    if "## Attempts and limitations\n" in previous:
        failures = previous.split("## Attempts and limitations\n", 1)[1]
    else:
        failures = "\nNo failed attempts were recorded.\n"
    text = ("# Capture verification\n\nStatus: **PASS** — two distinct Codex sessions have exact canary prompts and real final responses.\n\n"
            "Tool: Codex CLI 0.164.0 / Codex VS Code. Planning and execution model for setup: `gpt-6.1-sol`; "
            "each captured entry records its runtime model.\n\n"
            "Mechanism: the detached transcript watcher in `scripts/agent_capture.py`, configured by `.agent-capture.json`. "
            "`scripts/codex-captured` starts it automatically before launching Codex. It also observes ordinary VS Code "
            "sessions while running. It exports only actual user text and final answers. Existing entries are never "
            "rewritten; only frontmatter counters and the last prompt timestamp are updated in place.\n\n"
            "Native hooks were checked against the [official hook documentation](https://learn.chatgpt.com/docs/hooks).\n\n")
    for i, session in enumerate(result["verified_sessions"][:2], 1):
        text += (f"## Canary session {i}\n\nSession: `{session['session_id']}`\n\n"
                 f"Log: [{session['log']}]({session['log']})\n\n"
                 + session["raw_entries"])
    text += "## Attempts and limitations\n" + failures
    if text != previous:
        proof.write_text(text, encoding="utf-8", newline="")


def state_dir(repo):
    path = repo / ".agent-capture-state"
    path.mkdir(mode=0o700, exist_ok=True)
    return path


def watch(repo, sessions_root):
    state = state_dir(repo)
    with (state / "watch.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        stopping = False

        def stop(signum, frame):
            nonlocal stopping
            stopping = True

        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)
        interval = max(0.05, float(config(repo).get("poll_seconds", 1)))
        while not stopping:
            status = {"pid": os.getpid(), "last_scan_utc": utc_now(), "sessions_root": str(sessions_root)}
            try:
                captured = sync(repo, sessions_root)
                result = verify(repo, sessions_root, captured)
                publish_proof(repo, result)
                status.update(logs=[str(s["log"].relative_to(repo)) for s in captured],
                              verified_sessions=len(result["verified_sessions"]), error=None)
            except Exception as exc:
                status["error"] = str(exc)
                print(f"{utc_now()} capture error: {exc}", file=sys.stderr, flush=True)
            temporary = state / "status.tmp"
            temporary.write_text(json.dumps(status, indent=2) + "\n", encoding="utf-8")
            temporary.replace(state / "status.json")
            time.sleep(interval)


def status(repo):
    state = state_dir(repo)
    path = state / "status.json"
    result = json.loads(path.read_text()) if path.exists() else {"error": "Watcher has not started"}
    alive = False
    if result.get("last_scan_utc"):
        # Managed command sessions can have separate PID namespaces. The shared
        # file lock and heartbeat are reliable across those namespaces.
        try:
            with (state / "watch.lock").open("a") as lock:
                try:
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except BlockingIOError:
                    alive = (datetime.now(timezone.utc) - utc_stamp(result["last_scan_utc"])).total_seconds() < 30
        except OSError:
            alive = False
    result["running"] = alive
    return result


def start(repo, sessions_root):
    current = status(repo)
    if current["running"]:
        return current
    state = state_dir(repo)
    with (state / "watcher.stderr.log").open("ab") as diagnostic:
        child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "watch",
                                  "--repo", str(repo), "--sessions-root", str(sessions_root)],
                                 stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                 stderr=diagnostic, start_new_session=True, close_fds=True)
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        current = status(repo)
        if current["running"]:
            if current.get("error"):
                raise RuntimeError(current["error"])
            return current
        if child.poll() is not None:
            raise RuntimeError(f"Watcher exited; inspect {state / 'watcher.stderr.log'}")
        time.sleep(0.1)
    raise RuntimeError("Watcher did not become ready within 10 seconds")


def canaries(repo, sessions_root):
    settings = config(repo)
    start(repo, sessions_root)
    prompt = f"CAPTURE TEST — 8x assignment, {settings['name']}"
    for _ in range(2):
        completed = subprocess.run([
            "rtk", "proxy", "codex", "exec", "--skip-git-repo-check", "--sandbox", "read-only",
            "--color", "never", "--model", settings["model"], "--cd", str(repo), prompt,
        ], stdin=subprocess.DEVNULL)
        if completed.returncode:
            raise RuntimeError("A real Codex canary session failed; verification remains PENDING")
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        result = verify(repo, sessions_root)
        if result["passed"]:
            publish_proof(repo, result)
            return result
        time.sleep(0.2)
    raise RuntimeError("Two real canary prompt/final pairs were not found; verification remains PENDING")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("start", "watch", "status", "sync", "verify", "canaries"))
    parser.add_argument("--repo", type=Path, default=DEFAULT_REPO)
    parser.add_argument("--sessions-root", type=Path, default=default_sessions())
    args = parser.parse_args()
    repo, sessions_root = args.repo.resolve(), args.sessions_root.resolve()
    if args.command == "watch":
        watch(repo, sessions_root)
        return
    if args.command == "start":
        result = start(repo, sessions_root)
    elif args.command == "status":
        result = status(repo)
    elif args.command == "sync":
        result = {"logs": [str(item["log"].relative_to(repo)) for item in sync(repo, sessions_root)]}
    elif args.command == "canaries":
        result = canaries(repo, sessions_root)
    else:
        result = verify(repo, sessions_root)
        publish_proof(repo, result)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    if args.command == "verify" and not result["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError) as error:
        print(f"Capture error: {error}", file=sys.stderr)
        raise SystemExit(1)
