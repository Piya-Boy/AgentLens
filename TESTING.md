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
- Transport note: the replay ran before the per-user endpoint secret was added, so it used the older path-hash endpoint name. The current secret-based path is covered by the integration test and unit tests, and this real-session replay was not repeated with it.
### 2026-11-09 — Filesystem fallback with real shells

- Environment: Windows 11, VS Code 1.145.2 (integration host), Windows PowerShell 5.1 and PowerShell 7 installed
- Steps: the integration suite runs a PowerShell script that creates, appends to, renames and deletes files in the fixture workspace, and runs a similar script as the command of a VS Code integrated terminal.
- Expected: every change appears in the activity history as a `filesystem` event with the right action and path, no file is opened.
- Actual: all expected events were recorded and nothing was opened. Result: PASS
- Not covered here: macOS and Linux. WSL and typed terminal input are in the next report. An earlier attempt to type into an integrated terminal did not produce a file; its cause was not isolated (see the next report for the version that works).

### 2026-11-09 — WSL and typed terminal input

- Environment: Windows 11, VS Code 1.145.2 (integration host), WSL2 distribution `Ubuntu-restored` (default), `E:` mounted at `/mnt/e`
- Steps:
  1. WSL: the suite runs `wsl.exe --exec sh -c` with a script that creates, appends to, renames and deletes files in the fixture workspace through `/mnt/e/...`. The case skips itself when `wsl.exe` cannot start or cannot see the fixture folder.
  2. Typed input: the suite creates an interactive PowerShell terminal (`-NoProfile -NoLogo`), shows it, waits for the process id plus 4 s for the prompt, then types a script that creates, appends to and removes a file, once with `terminal.sendText` and once with the `workbench.action.terminal.sendSequence` command.
- Expected: every operation appears as a `filesystem` event with the right action and path, and no file is opened.
- Actual:
  - WSL: create, edit, delete of the first file and create, delete of the renamed file were all recorded; nothing was opened.
  - Typed input: both variants produced create, edit and delete events (the create event arrived about 0.4-0.5 s after typing). In a separate probe, typing `exit` closed PowerShell and cmd.exe terminals through both paths, so input does reach the shell.
  - The first typed probe wrote create, edit and delete with no pause between them and recorded nothing; with 700 ms pauses it works. The watcher merges operations that happen within a few milliseconds. This probably explains the earlier failure, but that was not re-run to confirm.
- Result: PASS on 1.145.2 (26/26). The same three cases also passed on VS Code 1.90.0 (26/26, shutdown check passed).
- Not covered: a Remote-WSL window (the extension host would run inside WSL), the POSIX variants of the terminal tests, other WSL distributions, macOS and Linux.

### 2026-11-09 — Declared minimum VS Code version (1.90.0)

- Environment: Windows 11, VS Code 1.90.0 downloaded by the test runner (`VSCODE_TEST_VERSION=1.90.0 npm run test:integration`; `resources/app/package.json` reports 1.90.0), Node.js 24.22.1 for the runner
- Steps: the whole integration suite, unchanged, in the 1.90.0 Extension Development Host, followed by the shutdown check.
- Expected: same results as on 1.145.2, including tab closing, typing deferral, filesystem fallback, PowerShell and the burst tests.
- Actual: 23/23 passed. Burst (500 files): lag 18-23 ms, 977 and 968 events recorded; 150-file coverage run 150 of 150. Shutdown check passed. The host printed `Error mutex already exists` at start, a message from VS Code's own main process that did not affect the run; its cause was not investigated.
- Result: PASS
- Not covered: versions between 1.90.0 and 1.145.2; macOS and Linux.

### 2026-11-09 — Extension deactivation

- Environment: Windows 11, VS Code 1.145.2 (integration host)
- Steps:
  1. A temporary probe in `deactivate()` appended a line to a file outside the repository; the integration suite ran; the probe was then removed (not committed).
  2. `scripts/run-integration.mjs` now runs the host with its own `--user-data-dir`, and `scripts/verify-deactivation.mjs` reads the host's `exthost.log` after the run.
- Expected: VS Code calls `deactivate()` when the host terminates, and disposing the extension's subscriptions logs no error from the extension bundle.
- Actual: the probe file had one line written at host termination, so `deactivate()` runs. The permanent check requires the host to log `Extension host terminating` and no `[error]` entry whose stack contains `dist/extension.js` of this repository. It passed on a full run (23/23). It does not blame the error `Canceled: Canceled` that the built-in TypeScript extension logs at the same moment. Checked against synthetic logs: clean, foreign-extension error, bundle error (path and `file:///` forms), missing terminate line.
- Result: PASS
- Not covered: the effects of each disposable (for example that the hook pipe closes) are not observed; the host process exit would close them anyway. A log line from `deactivate()` is lost because the host cancels its RPC channel while terminating, so the output channel cannot be used as evidence. Reload and window-close paths were not run separately.

### 2026-11-09 — Filesystem watcher burst

- Environment: Windows 11, VS Code 1.145.2 (integration host), fixture workspace on a local disk
- Steps: the integration suite writes 500 files in batches of 100 into a new folder under the fixture workspace in three scenarios (AgentLens disabled, enabled with the AgentLens view hidden, enabled with the view visible), sampling the extension host's event-loop lag every 25 ms and its heap before and after. A fourth run clears the history and writes 150 files, few enough that all their events fit under the 500-event history cap, then checks every file name.
- Expected: when enabled, at least as many events are recorded as files written; history stays capped at 500; the extension host does not stall (lag under 2 s); in the 150-file run every file has a `create` event in the history.
- Actual:
  - Earlier manual run with 1000 files: disabled 17.9 s, lag 29 ms; view hidden 25.0 s, 2008 events (create and change per file), lag 41 ms, heap delta -0.9 MB; view visible 36.2 s, 1933 events, lag 24 ms, heap delta 2.1 MB.
  - Latest committed test (500 files): disabled 36.6 s, lag 23 ms; view hidden 9.2 s, 1015 events, lag 24 ms, heap delta 1.6 MB; view visible 17.3 s, 1044 events, lag 78 ms, heap delta 3.2 MB. Write times vary a lot between runs on this disk.
  - 150-file coverage run: 150 of 150 files have a `create` event.
  - An earlier single run with the view opened right before sampling showed a 909 ms lag once; it did not repeat and was not explained.
- Result: PASS
- Limits of the check: the 500-file scenarios assert only that the event count is at least the file count. Events are counted per session, so duplicates could hide a missing file there, and the 500-event history cap evicts older events, so per-file coverage is proved only by the 150-file run. Not covered: CPU use of VS Code's file-watcher process, a real branch checkout, long-running memory, macOS and Linux.
