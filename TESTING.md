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
- Transport note: the replay ran before the per-user endpoint secret was added, so it used the older path-hash endpoint name. The current secret-based path is covered by the integration test and unit tests, and by the later real sessions in the report "Real Claude Code sessions with the endpoint secret" below.
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

### 2026-11-09 — Real Claude Code sessions with the endpoint secret

- Environment: Windows 11, Claude Code 2.1.319 (`claude -p`, model haiku, `--permission-mode acceptEdits`), the real per-user secret in `%LOCALAPPDATA%\agentlens\endpoint-secret`, VS Code 1.145.2 for the second step. Temporary project folders outside the repository; the prompts were trivial and no repository source was involved. The harness (scratch files, not committed) reused the repository's own installer, endpoint, secret and `IpcServer` code.
- Steps:
  1. The repository's `installHook` wrote the hook into the temporary project's `.claude/settings.local.json` (command `node "E:/Develop/CODING/AgentLens/dist/hook.js" --agentlens`). A scratch `IpcServer` listened on the endpoint derived from the real secret. A headless Claude Code session in that folder was asked to create `hello.txt` with the Write tool.
  2. The same project folder was opened in an Extension Development Host with AgentLens active. The file `notes.txt` existed (`one`). A real Claude Code session was started from the host and asked to replace its contents with `two` using the Write tool. The test waited for the AgentLens event and for the file to appear in a visible editor.
- Expected: the hook, started by Claude Code with its own environment, finds the endpoint and delivers the path; AgentLens records a `claude-code` event and opens the file before the change.
- Actual:
  - Step 1: the listener received one `PreToolUse` message with `tool_name` `Write`, the real session id and tool-use id, the project folder as `cwd` and the target path; the message had no `content` field. `hello.txt` was created and the session replied `done`.
  - Step 2: AgentLens recorded one event (`agentId` `claude-code`, `action` `edit`, `status` `started`, `source` `adapter`, `toolName` `Write`, the real path) about 10 s after the session started (model latency) and `notes.txt` was visible in an editor at that moment (it was not open before). The file then contained `two` and the session replied `done`.
- Result: PASS
- Not covered: other Claude Code versions, interactive (non-headless) sessions, the `Edit` tool, several sessions at once, and a hook and window started with different environment values (see the Linux report for that limit). Step 2 shows the file visible after the event; it does not prove the open happened before Claude Code wrote the file, only that the event is a `started` pre-edit event.

### 2026-11-09 — Unit suite on Linux (WSL2)

- Environment: WSL2 distribution `Ubuntu-restored` (kernel 6.18.54.1-microsoft-standard-WSL2). Node.js 24.22.1 linux-x64 was downloaded from nodejs.org and checked against its `SHASUMS256.txt`. Everything lived under `/tmp` (tmpfs, so real Unix modes): the Node tarball, a `git archive HEAD` copy of the repository, and `HOME` and the npm cache for `npm ci`. Nothing was installed system-wide and no distribution setting was changed; the work folder was removed afterwards (the Node compile cache that Node wrote to `/tmp` outside it was found later and removed by hand, see the integration report below).
- Steps: `npm ci`, then `npm run lint`, `npm run typecheck`, `npm run build` and `npx vitest run` in that copy. The copy's `src/` was compared with the working tree and had no differences.
- Expected: all tests pass, including the ones Windows skips (secret file mode and owner checks, socket permissions, installer file mode, file-symlink refusal).
- Actual: lint, typecheck and build clean; 414 passed, 0 skipped (Windows: 404 passed, 10 skipped). New tests added in this change:
  - `src/hook/claude-hook-process.test.ts`: bundles `src/hook/claude-hook.ts` with esbuild into a temp folder, runs it as a child process with an isolated home, state and runtime folder, and checks that it delivers only tool, session and path to an `IpcServer` (named pipe on Windows, Unix socket on Linux), finds a parent folder's window, prints nothing, exits 0, and sends nothing when there is no secret or the listener uses a different secret. A Unix-only case leaves `XDG_RUNTIME_DIR` unset and points `TMPDIR` at the runtime folder, which proves the hook and the listener fall back to the same temp-directory socket folder. 6 tests (5 on Windows), pass.
  - `src/transport/ipc-server.test.ts`: a socket directory that group or others can access is refused, and so is one that is a symbolic link (Unix only). Mutation check: removing the mode check in the Linux copy made the first test fail; restoring it made the file pass again.
- Result: PASS
- Not covered: macOS; a hook and a VS Code window started with different `TMPDIR` or `XDG_RUNTIME_DIR` values (they would not find each other; the fallback only works when both sides see the same environment); the branches that need another user (socket directory or secret owned by someone else); a Remote-WSL window; Windows named-pipe access rights. The integration suite on Linux is in the next report.

### 2026-11-09 — Integration suite on Linux (WSL2, Xvfb)

- Environment: same WSL2 distribution and `/tmp` setup as the report above (Node.js 24.22.1, copy of the working tree), `npm ci`, then `npm run test:integration` under `xvfb-run` so no window opens on the Windows desktop. The runner downloaded VS Code 1.145.2 for linux-x64 into the copy. The first run left an empty socket folder (`agentlens-1000`) and a VS Code git socket under `/run/user/1000`, found by listing afterwards and removed by hand; the tiny `dbus-1` and `dconf` folders that VS Code's GTK created in that run stay (they live on tmpfs). The unit runs earlier left `/tmp/node-compile-cache`, also removed by hand. The script was then changed to point `HOME`, `TMPDIR` and every `XDG_*` folder (including `XDG_RUNTIME_DIR`, mode 0700) at its work folder, and a second run (22 passed, 4 skipped, shutdown check passed) left `/tmp`, `/run/user/1000` and the WSL user's `.config`, `.cache` and `.local/state` listings identical before and after. The real `~/.local/state/agentlens` was never created.
- Expected: the same behaviour as on Windows for the cases that apply on Linux.
- Actual: 22 passed, 4 skipped (the cases that need Windows: PowerShell, WSL, and the two typed-terminal cases), 0 failed, shutdown check passed. Included: a real Claude Code `PreToolUse` payload through `dist/hook.js` over a Unix socket opening the file, the hook staying silent with no listener, the POSIX version of the integrated-terminal case (`/bin/sh -c`), the burst test (500 files written in about 20-30 ms on this filesystem, lag at most 8 ms, coverage run 150 of 150) and the filter, tab, typing and focus cases.
- Result: PASS
- Not covered: typed input into a POSIX terminal (the typed cases use PowerShell), VS Code versions other than 1.145.2 on Linux, macOS, a Remote-WSL window, a desktop session instead of Xvfb.

### 2026-11-09 — Packaged extension (VSIX contents)

- Environment: Windows 11, VS Code 1.145.2. `npx @vscode/vsce@4.1.0 package --no-dependencies` produced the VSIX; it was unpacked into a temporary folder and `AGENTLENS_EXTENSION_PATH=<that folder>/extension npm run test:integration` loaded the extension from there instead of from the repository (the host log shows the unpacked path).
- Expected: the packaged file set (manifest, README, `dist/extension.js`, source map, `dist/hook.js`, `media/**`) is enough for every integration case, including the hook script cases.
- Actual: 26/26 passed, shutdown check passed. vsce only warned that there is no LICENSE file.
- Result: PASS
- Not covered: installing the VSIX through the VS Code UI or `code --install-extension`, installing it on Linux, and the Marketplace install flow.

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

### 2026-11-09 — Update check

- Environment: Windows 11, VS Code 1.145.2 (integration host), Node.js 22; unit suite on the same machine
- Steps: `npm test` with the new `src/update/*.test.ts` files; `npm run test:integration` on the latest host and with `VSCODE_TEST_VERSION=1.90.0`; one `curl` of the real latest-release URL; a deliberate mutation run with the setting scope removed, to confirm the scope test fails.
- Expected: version text is parsed strictly; a release with a draft or pre-release flag or an odd tag is rejected, and the release page link is built from the tag whatever the response's own URLs say; a workspace setting cannot turn the check on; the checker reports a newer release once per version, at most once a day, and keeps working when saving state fails; the fetch sends a GET with the user agent and the GitHub `Accept` header, refuses redirects, refuses a body over 64 KiB and fails on non-200; the command is registered and the setting defaults to `false`.
- Actual: unit suite 462 passed, 10 skipped (472; 58 of them new). Integration 27 of 27 passed on 1.145.2 and on 1.90.0, and the host shut down cleanly. With the `application` scope removed the workspace-settings test failed, as intended; the scope was restored and the test passed again. The real URL answered HTTP 404 on 2026-11-09 because the repository has no release.
- Result: PASS
- Limits of the check: the tests use a loopback server and fake releases, so no real release has been parsed. The 5 s timeout and the notification dialog were not exercised (nothing in the integration suite calls the network). The automatic start-up check was not run in a live host with the setting on. Behaviour behind a proxy or a corporate network (global `fetch` in the extension host) is untested. Linux and macOS were not run for this change.

### 2026-11-09 — Activation without an explicit activate() call

- Environment: Windows 11, VS Code 1.145.2 (Extension Development Host started with a scratch folder, `--disable-extensions`, own user-data folder). The probe was a scratch suite outside the repository.
- Steps: open a folder with the extension under development, never call `activate()`, and poll `extension.isActive` for up to 20 s. Run once with the manifest as it was and once with `"activationEvents": ["onStartupFinished"]`.
- Expected: the extension is active shortly after the window has started, because it has to watch files and receive hook events without the user opening anything.
- Actual: without `activationEvents` the extension was still inactive after 20 154 ms. With `onStartupFinished` it was active after 257 ms.
- Result: FAIL before the fix, PASS after it
- Limits of the check: one host, one run each. The integration suite cannot tell the two cases apart because it calls `activate()` itself; the manifest is guarded only by a unit test of its `activationEvents`. Not run on 1.90.0, Linux or macOS.

### 2026-11-09 — Stable hook script copy

- Environment: Windows 11, VS Code 1.145.2 and 1.90.0 (integration hosts), Claude Code 2.1.319 (`claude -p`, model haiku, `--permission-mode acceptEdits`) for the real session; unit suite also on Linux (WSL2, Node 24.22.1, copy of the repository under `/tmp`).
- Steps:
  1. Unit tests of `deployHookScript` and `stableHookPath` (create, identical copy left alone, replace in place with the same path when a new extension version brings a new script, restore an edited copy, missing source writes nothing, folder at the target refused, a rename refused because another window already wrote the same script counts as done while any other refusal is reported; Unix only: mode 0600, symbolic link refused and not written through, world-writable copy refused, world-writable state folder refused with nothing written, state folder that is a symbolic link refused).
  2. Integration case: after activation the copy exists at `api.hookScriptPath()`, is outside the versioned extension folder, is byte-identical to `dist/hook.js`, and a real `PreToolUse`-shaped payload run through the copy opens the file.
  3. Real session: the repository installer wrote `node "C:/Users/Acer/AppData/Local/agentlens/hook.js" --agentlens` into a scratch project, the project was opened in an Extension Development Host with AgentLens active, and a headless Claude Code session was asked to replace `notes.txt` with `two` using the Write tool.
- Expected: the hook entry names a path that does not change when the extension updates; the copy always equals the bundled script; the hook run by Claude Code from that path reaches the extension.
- Actual: Windows unit suite 473 passed, 15 skipped (488; the skipped ones are Unix-only). Linux unit suite 488 passed, 0 skipped. Integration 28 of 28 on 1.145.2 and on 1.90.0, shutdown check passed. Real session: AgentLens recorded one `claude-code` event (`edit`, `started`, tool `Write`) 8.5 s after the session started and `notes.txt` was visible in an editor 109 ms later; the file then contained `two` and the session replied `done`. The same host printed 24 `[AgentHost:stderr] ... ERR_STREAM_DESTROYED` lines that the earlier real-session run did not. A later probe host that loaded an empty dummy extension instead of AgentLens printed the same error (4 lines), so it is VS Code's own agent host, not this extension.
- Result: PASS
- Limits of the check: the update simulation below used the code CLI to install a second VSIX over the first, not VS Code's own update flow, and did not wait for VS Code to delete the obsolete version folder. Two editors with different extension versions were not tried. Running the integration suite writes `hook.js` into `%LOCALAPPDATA%\agentlens` of the user who runs it, next to the endpoint secret. macOS and Remote-WSL were not run for this change.

### 2026-11-09 — Re-run of the packaged, Linux and ACL checks after the stable hook path

- Environment: Windows 11 Home, VS Code 1.145.2; Linux in WSL2 (Node 24.22.1, Xvfb, copy of the repository under `/tmp`, removed afterwards).
- Steps:
  1. `vsce@4.1.0 package --no-dependencies` into a scratch folder (10 files: manifest, readme, `dist/extension.js`, source map, `dist/hook.js`, `media/**`), unpacked, `AGENTLENS_EXTENSION_PATH=<unpacked>/extension npm run test:integration` (the host log shows the unpacked path).
  2. The Linux integration script on the working tree of this branch.
  3. `icacls` (read only) on `%LOCALAPPDATA%`, `%LOCALAPPDATA%\agentlens`, and the `hook.js` and `endpoint-secret` files in it.
- Expected: the packaged file set runs every case, including the stable hook copy; Linux behaves like Windows except for the Windows-only cases; only the user and administrators can write the state folder on Windows.
- Actual: packaged 28 of 28 passed, shutdown check passed. Linux 24 passed, 4 skipped (the Windows-only cases), shutdown check passed, including the stable-copy case with a real `XDG_STATE_HOME`. `icacls`: the folder and both files inherit full control for `SYSTEM`, `BUILTIN\Administrators` and the owner only; no `Users`, `Everyone` or `Authenticated Users` entry.
- Result: PASS
- Limits of the check: the ACL was read on one Windows 11 Home machine with a local account; domain accounts, redirected profiles and Windows versions other than this one were not inspected. The VSIX was loaded from an unpacked folder, not installed through the VS Code UI or `code --install-extension`. Remote-WSL and macOS were not run.

### 2026-11-09 — VSIX installed with the code CLI

- Environment: Windows 11, the installed VS Code, with `--extensions-dir` and `--user-data-dir` pointing at empty scratch folders so the real VS Code profile was not touched (folders removed afterwards).
- Steps: `code --extensions-dir <scratch> --user-data-dir <scratch> --install-extension agentlens.vsix` with the VSIX packaged from this branch, then `--list-extensions --show-versions`.
- Expected: the VSIX installs and is listed.
- Actual: "Extension 'agentlens.vsix' was successfully installed." and `undefined_publisher.agentlens@0.0.1` was listed (the id has `undefined_publisher` because `publisher` is not set in `package.json`).
- Result: PASS
- Limits of the check: the installed copy was not started or used with Claude Code, and the install was not done through the VS Code UI or from the Marketplace. macOS and Linux were not tried.

### 2026-11-09 — Simulated extension update with a real Claude Code session

- Environment: Windows 11, VS Code 1.145.2 host started with its own extensions folder, user-data folder and a scratch `LOCALAPPDATA` (so the real profile and the real hook copy were not touched), Claude Code 2.1.319 (`claude -p`, model haiku, `--permission-mode acceptEdits`). The extension was installed from a VSIX with `code --install-extension`, not loaded as a development extension, and the suite never called `activate()`.
- Steps:
  1. Package the branch as 0.0.1; package a second VSIX as 0.0.2 whose `dist/hook.js` has one extra comment line. Install 0.0.1.
  2. Write the hook entry into a scratch project with the repository installer (it names `<scratch LOCALAPPDATA>/agentlens/hook.js`). The copy did not exist yet.
  3. Phase A: start the host, wait for the extension to become active by itself, record the copy's and the bundled script's SHA-256, then run a headless Claude Code session that writes `a.txt` with the Write tool.
  4. Install the 0.0.2 VSIX into the same extensions folder, leaving the settings file as it was.
  5. Phase B: the same, writing `b.txt`.
- Expected: the extension starts without being asked; the copy is created, then replaced with the new script; the settings entry does not change and does not name an extension folder; Claude Code's hook reaches the extension both before and after the update.
- Actual: phase A: extension 0.0.1 active on its own, copy created, copy and bundled SHA both `c17585737…`, Claude Code event for `a.txt` after 6.8 s, file contained `A`. Phase B: extension 0.0.2 active on its own, copy SHA `13ca18b47…` equal to the new bundled script and different from before (the end of `hook.js` carries the 0.0.2 marker), the settings file byte-identical to its state before the update (compared with `cmp`), Claude Code event for `b.txt` after 12.5 s, file contained `B`. Neither entry named an extension folder.
- Result: PASS
- Limits of the check: the old 0.0.1 folder was still on disk during phase B (VS Code deletes obsolete versions later), so this run shows the entry no longer depends on the extension folder and that the copy follows the update, but it does not show a missing-folder failure that the old design would have had. The update was a CLI install, not VS Code's updater or the Marketplace. One machine, one Claude Code version, `LOCALAPPDATA` overridden for the host. Two editors with different versions were not tried.

### 2026-11-09 — Packaging with a publisher

- Environment: Windows 11, vsce 4.1.0, the installed VS Code with scratch `--extensions-dir` and `--user-data-dir`.
- Steps: set `"publisher": "piya-boy"`, `vsce package --no-dependencies`, install the VSIX with `code --install-extension`, `--list-extensions --show-versions`; try `vsce publish --dry-run`; read the vsce source for the publisher rule and for any handling of `private`.
- Expected: the VSIX builds without a publisher warning and installs under the id `piya-boy.agentlens`; the publisher id is valid.
- Actual: packaged (10 files) with only the LICENSE warning; `piya-boy.agentlens@0.0.1` was listed. `vsce publish` has no `--dry-run` option in 4.1.0, so a publish was not tried and no token was used. vsce validates the id with `^[a-z0-9][a-z0-9-]*$` (case-insensitive) and does not read `private`.
- Result: PASS for packaging and install
- Limits of the check: the publisher does not exist on the Marketplace, so a real publish, the token flow and the listing page were not run. The id was chosen by me, not given by the owner.
