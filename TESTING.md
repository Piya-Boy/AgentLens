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
