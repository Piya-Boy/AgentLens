# Testing Strategy

## 1. Testing Principles

- Test behavior, not just implementation details.
- Unit tests for Core logic.
- Integration tests for VS Code API and extension lifecycle.
- Test success, failure, and edge cases.
- Do not use mocks alone to claim that a real integration works.

## 2. Unit Tests

Cover:
- Event validation
- Path normalization
- Workspace boundary checks
- Event deduplication
- Session management
- Focus queue / debounce
- Tab safety decisions
- History retention

## 3. Integration Tests

Cover:
- Extension activation/deactivation
- Command registration
- TreeView rendering / provider updates
- Opening a document from a valid pre-edit event
- Filesystem watcher create/change/delete
- Pause / Resume / Auto Focus settings
- Adapter lifecycle and error isolation

## 4. Manual Test Scenarios

1. Edit a file from an Agent inside VS Code.
2. Edit a file from Terminal outside VS Code.
3. Edit a file from PowerShell.
4. Edit a file from WSL in a Workspace opened through VS Code.
5. Two Agent Sessions running simultaneously.
6. The same event sent more than once.
7. A file deleted or moved while waiting to be focused.
8. Auto Focus disabled.
9. Pause triggered while events are incoming.
10. Dirty/pinned/active tabs present while an Agent opens multiple files.

## 5. Detection Accuracy

Test results must be separated by source:
- **Adapter pre-edit:** Prove the event arrived before the edit.
- **Filesystem watcher:** Prove detection happened after a filesystem change.

Never use filesystem watcher results to claim pre-edit detection capability.

## 6. Test Report

Record:
- Environment / OS
- VS Code version
- Agent and version under test
- Steps to reproduce
- Expected result
- Actual result
- PASS / FAIL / NOT RUN
- Sanitized logs

## Test Reports

### 2026-11-09 — Claude Code PreToolUse hook, real session

- Environment: Windows 11, Node.js 24.22.1, VS Code 1.145.2 (integration host)
- Agent: Claude Code 2.1.319, headless (`claude -p`, model haiku, `--permission-mode acceptEdits`), in a temporary project outside this repository
- Steps:
  1. Project `.claude/settings.json` registered two `PreToolUse` hooks for `Edit|Write`: a logger that records the raw stdin payload with `Date.now()`, and `dist/hook.js --agentlens`.
  2. Asked Claude Code to create `hello.txt` with the Write tool, then to change its text with the Edit tool.
  3. Fed the captured raw Write payload to `dist/hook.js` with a live `IpcServer` on the project's endpoint, then through `parseClaudePreToolUse` and `EventManager`.
- Expected: the hook runs before the file changes; payload fields match the documentation; the AgentLens hook never blocks or prints; the event is accepted with the right session, tool and absolute path.
- Actual:
  - Write: hook fired 63 ms before the file's creation time. Payload had `file_path` (absolute, backslash separators), `content`, `tool_use_id`, `session_id`, `cwd`.
  - Edit: payload had `file_path` (absolute), `old_string`, `new_string`, `replace_all`, `tool_use_id`, `session_id`.
  - `dist/hook.js` exited 0 with empty stdout in both the real session (no listener) and the replay (listener present). Claude Code completed both edits normally.
  - Replay result: one accepted event, agent `claude-code`, action `edit`, status `started`, source `adapter`, tool `Write`, correct path, no file content.
- Result: PASS
- Not covered: a live VS Code window with the installed hook receiving a real session (the receiving side was exercised by the integration test and by the replay above, not in the same run); other Claude Code versions; interactive (non-headless) mode; Unix sockets.

### 2026-11-09 — Filesystem fallback with real shells

- Environment: Windows 11, VS Code 1.145.2 (integration host), Windows PowerShell 5.1 and PowerShell 7 installed
- Steps: the integration suite runs a PowerShell script that creates, appends to, renames and deletes files in the fixture workspace, and runs a similar script as the command of a VS Code integrated terminal.
- Expected: every change appears in the activity history as a `filesystem` event with the right action and path, no file is opened.
- Actual: all expected events were recorded and nothing was opened. Result: PASS
- Not covered: WSL; typing into an integrated terminal (`terminal.sendText` did not run the command in the test host, with or without a shell profile, so that approach was abandoned); macOS and Linux.

### 2026-11-09 — Filesystem watcher burst

- Environment: Windows 11, VS Code 1.145.2 (integration host), fixture workspace on a local disk
- Steps: the integration suite writes 1000 files in batches of 100 into a new folder under the fixture workspace in three scenarios (AgentLens disabled, enabled with the AgentLens view hidden, enabled with the view visible), sampling the extension host's event-loop lag every 25 ms and its heap before and after.
- Expected: no events lost when enabled, history stays capped at 500, the extension host does not stall.
- Actual (1000 files, one run):
  - disabled: written in 17.9 s, lag 29 ms
  - enabled, view hidden: written in 25.0 s, 2008 events recorded (create and change per file), lag 41 ms, heap delta -0.9 MB
  - enabled, view visible: written in 36.2 s, 1933 events recorded, lag 24 ms, heap delta 2.1 MB
  - 500-file runs gave lag of 21-26 ms. An earlier single run with the view opened right before sampling showed 909 ms once; it did not repeat.
- Result: PASS (the committed test uses 500 files and fails if events are lost, history exceeds its cap, or lag reaches 2 s)
- Not covered: CPU use of VS Code's file-watcher process, a real branch checkout, long-running memory, macOS and Linux.
