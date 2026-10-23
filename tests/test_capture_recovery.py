"""Recovery regression fixtures, never evidence of real model canaries."""

import fcntl
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_agent_capture import session, turn, write_rows

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from recover_agent_capture import recover
import agent_capture as capture


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.repo = Path(self.tmp.name) / "repo"
        self.repo.mkdir()
        self.config = self.repo / ".agent-capture.json"
        self.config.write_text(json.dumps({
            "author": "test-author", "name": "Test Person", "project": "test-project",
            "model": "gpt-6.1-sol", "poll_seconds": 0.05,
        }))
        self.config_before = self.config.read_bytes()
        self.sources = Path(self.tmp.name) / "sources"
        self.sources.mkdir()
        self.source = self.sources / "rollout.jsonl"
        self.rows = session(self.repo) + turn("  Original prompt\n\nKeep trailing spaces  \n", "Original final\n\n\nverbatim")
        write_rows(self.source, self.rows)
        capture.sync(self.repo, self.sources)
        self.log = next((self.repo / ".agent-logs").glob("*.md"))
        self.original = self.log.read_bytes()
        self.damaged = b"\n".join(line.rstrip() for line in self.original.split(b"\n")).replace(b"\n\n\n", b"\n\n")
        self.log.write_bytes(self.damaged)

    def test_explicit_restore_preserves_evidence_and_allows_source_backfill(self):
        with self.assertRaises(ValueError):
            capture.sync(self.repo, self.sources)
        self.rows += turn("Next real fixture prompt", "Next fixture final", turn_id="turn-two", timestamp="2026-10-23T10:00:00.000Z")
        write_rows(self.source, self.rows)
        source_before = self.source.read_bytes()
        preview = recover(self.log, self.source, self.repo)
        self.assertTrue(preview["would_restore"])
        self.assertEqual(self.log.read_bytes(), self.damaged)
        result = recover(self.log, self.source, self.repo, apply=True)
        self.assertEqual(self.log.read_bytes(), self.original)
        evidence = self.repo / result["evidence_directory"]
        self.assertEqual((evidence / "altered-log.md").read_bytes(), self.damaged)
        self.assertEqual((evidence / "source.jsonl").read_bytes(), source_before)
        self.assertEqual((evidence / "altered-log.md").stat().st_mode & 0o777, 0o600)
        self.assertEqual(self.config.read_bytes(), self.config_before)
        self.assertEqual(self.source.read_bytes(), source_before)
        capture.sync(self.repo, self.sources)
        self.assertIn(b"Next fixture final", self.log.read_bytes())
        self.assertTrue(self.log.read_bytes().split(b"\n---\n", 1)[1].startswith(self.original.split(b"\n---\n", 1)[1]))
        self.assertFalse(recover(self.log, self.source, self.repo)["would_restore"])

    def test_changed_words_and_metadata_are_never_repaired(self):
        for altered in (self.damaged.replace(b"Original prompt", b"Different prompt"), self.damaged.replace(b"author: test-author", b"author: somebody-else")):
            self.log.write_bytes(altered)
            with self.assertRaises(ValueError):
                recover(self.log, self.source, self.repo, apply=True)
            self.assertEqual(self.log.read_bytes(), altered)

    def test_apply_refuses_to_race_a_live_watcher(self):
        state = self.repo / ".agent-capture-state"
        state.mkdir()
        with (state / "watch.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with self.assertRaisesRegex(ValueError, "Stop the watcher"):
                recover(self.log, self.source, self.repo, apply=True)
        self.assertEqual(self.log.read_bytes(), self.damaged)


if __name__ == "__main__":
    unittest.main()
