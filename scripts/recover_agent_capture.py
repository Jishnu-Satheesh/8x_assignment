#!/usr/bin/env python3
"""Explicit, source-backed recovery of whitespace-damaged capture projections.

Normal capture stays strict. This command never repairs changed words or session
metadata, and preserves the altered artifact and native transcript before an
atomic source-exact restoration. Backups contain raw evidence: keep them local.
"""

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import uuid

import agent_capture as capture


def digest(data):
    return hashlib.sha256(data).hexdigest()


def fields(header):
    lines = header.decode("utf-8").splitlines()
    if lines[0] != "---" or lines[-1] != "---":
        raise ValueError("Invalid capture frontmatter")
    result = {}
    for line in lines[1:-1]:
        key, separator, value = line.partition(":")
        if not separator or key in result:
            raise ValueError("Invalid capture metadata")
        result[key] = value.strip()
    return result


def write_new(path, data, mode=0o600):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    with os.fdopen(fd, "wb") as target:
        target.write(data)
        target.flush()
        os.fsync(target.fileno())


def recover(log, source, repo, apply=False):
    repo, source = Path(repo).resolve(), Path(source).resolve()
    log = Path(log)
    if log.is_symlink():
        raise ValueError("Refusing a symlink capture target")
    log = log.resolve()
    original, source_bytes = log.read_bytes(), source.read_bytes()
    # Parse one immutable snapshot, not two reads of an actively appended source.
    with tempfile.TemporaryDirectory(prefix="8x-capture-source-") as temp:
        snapshot = Path(temp) / "source.jsonl"
        write_new(snapshot, source_bytes)
        parsed = capture.read_session(snapshot, repo)
    if not parsed:
        raise ValueError("Source is not a human Codex session for this workspace")
    meta, entries = parsed
    if not entries:
        raise ValueError("Source has no runtime-backed entries")
    settings = capture.config(repo)
    name, _, _ = capture.render(meta, entries, settings)
    if log != repo / ".agent-logs" / name:
        raise ValueError("Source and capture filename do not identify the same session")
    end = original.index(b"\n---\n", 4) + len(b"\n---\n")
    old_header, old_body = original[:end], original[end:]
    normalize = lambda data: re.sub(rb"\s+", b"", data)
    canonical = None
    matched = None
    for count in range(1, len(entries) + 1):
        _, header, body = capture.render(meta, entries[:count], settings)
        if normalize(body) == normalize(old_body):
            if fields(old_header) != fields(header):
                raise ValueError("Session metadata differs; refusing recovery")
            canonical, matched = header + body, count
            break
    if canonical is None:
        raise ValueError("Non-whitespace capture content differs from source; refusing recovery")
    report = {
        "session_id": meta["id"], "log": str(log.relative_to(repo)),
        "source_file": source.name, "matched_entries": matched,
        "source_entries_available": len(entries),
        "altered_sha256": digest(original), "restored_prefix_sha256": digest(canonical),
        "source_snapshot_sha256": digest(source_bytes),
        "would_restore": canonical != original, "applied": False,
    }
    if not apply or canonical == original:
        return report

    state = capture.state_dir(repo)
    with (state / "watch.lock").open("a") as watcher_lock:
        try:
            fcntl.flock(watcher_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError("Stop the watcher before applying recovery") from None
        if log.read_bytes() != original:
            raise ValueError("Capture changed during inspection; retry inspection")
        evidence = state / "recovery-evidence" / (capture.utc_now().replace(":", "-") + "_" + uuid.uuid4().hex[:8])
        evidence.mkdir(parents=True, mode=0o700)
        write_new(evidence / "altered-log.md", original)
        write_new(evidence / "source.jsonl", source_bytes)
        report["evidence_directory"] = str(evidence.relative_to(repo))
        report["restored_at"] = capture.utc_now()
        write_new(evidence / "manifest.json", (json.dumps(report, indent=2) + "\n").encode())
        temporary = log.with_name("." + log.name + ".recovery-" + uuid.uuid4().hex)
        write_new(temporary, canonical, stat.S_IMODE(log.stat().st_mode))
        os.replace(temporary, log)
        directory = os.open(log.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
        if log.read_bytes() != canonical or (evidence / "altered-log.md").read_bytes() != original:
            raise RuntimeError("Recovery verification failed; preserved evidence is available")
        report["applied"] = True
        write_new(evidence / "verification.json", (json.dumps(report, indent=2) + "\n").encode())
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--log", type=Path, required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--repo", type=Path, default=capture.DEFAULT_REPO)
    parser.add_argument("--apply", action="store_true", help="Apply only after preserving source and altered bytes")
    args = parser.parse_args()
    print(json.dumps(recover(args.log, args.source, args.repo, args.apply), indent=2))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, RuntimeError) as error:
        print(f"Capture recovery refused: {error}")
        raise SystemExit(1)
