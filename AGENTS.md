# Assignment capture

Follow the shell instructions in `/home/spy/.codex/RTK.md`: prefix shell commands
with `rtk` (use `rtk proxy` for commands without a dedicated wrapper).

Read `CAPTURE-TEST.md` before assignment work. Until its status is PASS, work only
on capture setup. Never fabricate a canary or treat fixture tests as real sessions.

Capture is automatic while the transcript watcher runs. Use
`scripts/codex-captured` to launch new CLI sessions; it starts the watcher itself.
For a VS Code session, ensure the watcher is running at session startup with
`rtk proxy python3 scripts/agent_capture.py start`. There is no per-prompt command.
The watcher continues across turns and detects new sessions for this workspace.

Keep `.agent-logs/` in version control. Never edit, summarize, truncate, clean up,
or delete captured entries. Commit logs alongside the work that produced them,
as requested in the setup instructions. Do not claim a commit exists without
verifying it; the current managed environment protects `.git/` from writes.
