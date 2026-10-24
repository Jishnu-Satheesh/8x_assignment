# Capture integrity recovery — 2026-10-23

The current session's Markdown projection had been reformatted. Its entries matched the native Codex transcript except for whitespace, and its frontmatter padding had changed. The process that reformatted it was not identified. The normal watcher correctly refused to overwrite the mismatch; its error message reported a metadata change because the header byte length no longer matched.

## Recovery performed

- Preserved the altered log byte-for-byte and a native transcript snapshot in ignored `.agent-capture-state/recovery-evidence/`. Evidence files have mode 0600. These local files contain sensitive raw evidence and must not be published.
- Matched all 11 previously projected entries to the original transcript, including their metadata. No changed words or metadata substitutions were accepted. Git's earlier captured body also matched the authentic source prefix.
- With the verified workspace watcher stopped, atomically restored the source-exact prefix to the existing session filename. This was an explicit corruption recovery, not formatting, sanitization, or a manual reconstruction of text. The altered artifact remains preserved separately.
- Restarted the original watcher. It automatically appended the four outstanding source entries. The resulting 15-entry projection matched the transcript byte-for-byte, and the actual recovery request was present verbatim. Normal capture still rejects altered evidence; no tolerance was added to its integrity checks.
- Added `.prettierignore` entries for `.agent-logs/**` and `CAPTURE-TEST.md`. This protects capture outputs from Prettier; it does not authorize any other editor to reformat them.

The altered artifact SHA-256 was `405317b76e1ba3fe9452dcb553276b4182bade4c460bb534626565f4e48d74fb`. The restored source-exact 11-entry prefix SHA-256 was `79c3ac74cce92867d0d58be2c7416a9fa9983affc6c7296de5009b595b8caa72`. Subsequent automatic appends and the permitted frontmatter counter updates change the complete file hash. Private evidence manifests retain the source snapshot hash and recovery outcome.

## Requirements preserved and verification

Byte hashes confirmed these files stayed unchanged: `.agent-capture.json`, `AGENTS.md`, `CAPTURE-TEST.md`, `scripts/agent_capture.py`, and `scripts/codex-captured`. Author, project, model settings, automatic capture behavior, per-session filenames, source text, and the original real canary evidence were retained. No application files or integrations changed during recovery.

- All 11 recorder/recovery regression tests pass. Test fixtures are not claimed as model canaries.
- The two original real Codex canary sessions still verify against their actual prompts/final responses: `01a16822-b76d-7541-83cd-7b4ce40d943e` and `01a16823-fe48-70d1-8af4-4d180052007a`.
- The restarted watcher reports `running: true`, `error: null`, and `verified_sessions: 2`; its fresh heartbeat and exact current projection were checked.

## Guarded recovery utility

`scripts/recover_agent_capture.py` previews by default. Explicit `--apply` requires the watcher lock to be free and preserves the altered artifact/source before restoration. It rejects non-whitespace differences, changed session metadata, a mismatched session filename, symlink targets, and a log that changes during inspection. It restores only the already captured prefix; the ordinary watcher appends later entries. It never edits the original transcript or weakens `agent_capture.py`.

```bash
rtk proxy python3 scripts/recover_agent_capture.py --log PATH_TO_SESSION_LOG --source PATH_TO_ORIGINAL_CODEX_JSONL
# Apply only for a verified formatting-only mismatch, with the workspace watcher stopped:
rtk proxy python3 scripts/recover_agent_capture.py --log PATH_TO_SESSION_LOG --source PATH_TO_ORIGINAL_CODEX_JSONL --apply
rtk proxy python3 scripts/agent_capture.py start
rtk proxy python3 -m unittest discover -s tests -p 'test*capture*.py' -v
```

The credential previously pasted into this conversation remains in the authentic session log. That entire log and its backups remain local and uncommitted. Recovery does not make it safe to publish credentials or scrub raw evidence.
