# Roadmap — AgentLens

Statuses in this document represent plans, not confirmation that features are complete.

## Phase 0 — Project Foundation

- [x] Create VS Code Extension scaffold
- [x] Configure TypeScript, esbuild, ESLint, and test runner
- [x] Add enable/disable AgentLens command
- [x] Add basic configuration
- [ ] Verify activation and deactivation — activation verified by integration test; deactivation only indirectly (host exits with code 0), no dedicated test yet
- [x] Add README and development instructions

**Exit criteria:** Extension loads in Extension Development Host without errors and build passes.

**Evidence:** `npm run lint`, `typecheck`, `test` (5/5), `build` and `test:integration` (4/4, in a real Extension Development Host) pass. F5 was not pressed manually.

## Phase 1 — Core Event System

- [x] Define AgentFileEvent schema
- [x] Event validation and path normalization — lexical on ingest (absolute path, `..` collapse, workspace boundary, size limits); symlinks and junctions are resolved before a file is opened and files resolving outside the workspace are not opened (see SECURITY §2)
- [x] Event Manager — validate and dispatch with listener error isolation; not wired into the extension yet
- [x] Session Manager — in-memory, keyed by agent and session id, capped at 50 sessions (least recently updated evicted); not wired into the extension or persisted yet
- [x] Event deduplication — same event id per agent/session, or identical content within a 500 ms window; bounded to 1000 entries; wired into Event Manager. The 500 ms window is a proposed default, not validated against a real agent
- [x] Mock event command for testing — `AgentLens: Send Mock Pre-edit Event for Active File`; Event Manager and Session Manager are wired into the extension; events are recorded but no file is opened until the Focus Controller lands
- [x] Focus Controller — opens the file (preview tab, without taking input focus) only for adapter events with status `started` and action `edit`; honours `agentlens.focusMode`; open errors are reported, not thrown. No queue/debounce yet (Phase 5)
- [x] Auto Focus / Pause / Resume — auto focus on/off via the `agentlens.focusMode` setting (`auto`/`notify`/`off`, no toggle command); `AgentLens: Pause Auto Focus` / `Resume Auto Focus` commands; pause is in-memory (resets on reload) and events are still recorded while paused

**Exit criteria:** Sending a mock pre-edit event successfully opens the correct file safely.

**Evidence:** `test:integration` (8/8, real Extension Development Host with a fixture workspace) shows a mock pre-edit event makes the fixture file visible, an event outside the workspace is rejected, and nothing opens while disabled or paused. Unit tests: 109/109. Not yet covered: symlinks, a real agent adapter, queue/debounce.

## Phase 2 — Filesystem Fallback

- [x] Implement FileSystemWatcher — one `**/*` watcher via `createFileSystemWatcher`; directories are skipped
- [x] Detect create/change/delete — mapped to actions create/edit/delete; integration test covers a file created, appended and removed
- [x] Distinguish filesystem observations from agent events — source `filesystem`, status `observed`, agent `unknown`; the Focus Controller never acts on them
- [x] Workspace boundary validation — enforced by the shared event validator for filesystem events too; real-path check before opening files added later
- [x] Ignore patterns and debounce — folders from `agentlens.ignoredFolders` (default `.git`, `node_modules`) at any depth; 200 ms per-file debounce plus the 500 ms deduplication window
- [ ] Test files modified from Terminal/WSL — only simulated with a Node.js writer inside the integration test; no real terminal, PowerShell or WSL run yet

**Exit criteria:** Changes made outside VS Code are detected without claiming them as pre-edit events.

**Evidence:** `test:integration` (9/9) shows a file created, appended and deleted on disk is recorded as `observed` by agent `unknown`, and is not opened. Unit tests: 129/129. Not covered: real Terminal/PowerShell/WSL writers, large bursts, symlinks.

## Phase 3 — First Agent Integration

- [x] Review current Claude Code hook/event documentation — read https://code.claude.com/docs/en/hooks on 2026-11-09: `PreToolUse` runs before the tool, payload has `session_id`, `tool_name`, `tool_input.file_path` (absolute), `tool_use_id`; exit 0 with no output means no decision; command and http hook types exist. Not verified: async hook semantics, MultiEdit/NotebookEdit schemas (undocumented in the text read)
- [x] Design adapter based on actual payload structure — decided: a notify-only command hook (`dist/hook.js`) forwards file path, session, tool and cwd over a per-user local socket (Windows named pipe, Unix socket in a 0700 directory); no HTTP port. Endpoint is derived from the workspace real path and looked up from the hook's cwd and its ancestors. Hook installation is a separate item
- [x] Receive pre-edit events — `dist/hook.js` run as a separate process with a PreToolUse-shaped payload reaches the extension and opens the file (integration test on Windows named pipes). Not yet run by a real Claude Code session; the Unix socket path is untested on this machine
- [x] Map session and tool name — `session_id` to sessionId, `tool_use_id` to eventId, `tool_name` to toolName; Edit and Write map to edit, Read to read; other tools are unsupported
- [x] Handle timeout, malformed payload, and duplicate events — hook gives up after 300 ms per endpoint and 2 s overall and always exits 0 with no output; malformed or oversized messages are dropped (16 KiB limit, 2 s connection timeout); duplicates are dropped by the Event Manager
- [x] Install and uninstall the Claude Code hook — `AgentLens: Install Claude Code Hook` merges one `PreToolUse` entry (`Edit|Write`) into the first workspace folder's `.claude/settings.local.json` after a modal confirmation; invalid JSON or unexpected structure is never overwritten; uninstall removes only the AgentLens entry. The modal itself is not driven by tests (merge and file handling are unit-tested)
- [x] End-to-end testing — real Claude Code 2.1.319 sessions (Write and Edit) fired the hook before the file changed; the captured payload went through `dist/hook.js`, the IPC server, the parser and the Event Manager and produced the expected event (report in `TESTING.md`). Not run as a single session against a live VS Code window with the extension installed

**Exit criteria:** Test evidence confirms events arrive before edits and the file opens before the Agent acts.

**Evidence:** hook fired 63 ms before the file was created in a real Claude Code run (`TESTING.md`). The file opening in VS Code was verified separately by the integration test with a hook-shaped payload; the two have not been combined in one live run, so "opens before the agent acts" is supported but not measured end to end.

## Phase 4 — Activity UI

- [x] AgentLens Activity Bar — container with a monochrome icon and welcome text for empty views
- [x] Active Agents / Sessions view — one row per agent and session with event count and last activity time; no live/idle status yet
- [x] Recent Activity TreeView — newest first; observed filesystem events are labelled `observed`, adapter events keep their status; click opens the file
- [x] StatusBar — shows active, paused or off; click opens the AgentLens view
- [x] Event history — in-memory, newest first, capped at 500 events, metadata only; `AgentLens: Clear Activity History` clears it and the session list. Not persisted across reloads yet
- [x] Filter by Agent, Session, and Action — filters the Recent Activity view only (not Sessions); `AgentLens: Filter Activity...` opens a picker, or accepts `{ agentId, sessionId, action }` as an argument; the filter is in-memory and shown in the view description

**Exit criteria:** Users can inspect activity and status from the UI.

**Evidence:** `test:integration` (12/12) registers the view container and renders tree items from the real providers; unit tests 174/174. The UI has not been inspected visually (no screenshot or manual F5 session), and the QuickPick flow was not driven interactively (only the programmatic form is tested).

## Phase 5 — Smart Focus and Tab Management

- [x] Focus queue and arbitration — latest-wins queue: while a cooldown is running only the most recent requested file is kept and opened afterwards; pausing or setting the mode to `off` drops it
- [x] Debounce / cooldown — `agentlens.focusCooldownMs` (default 1000 ms, 0 disables) between automatic opens; unit-tested with fake timers, not measured against a real agent
- [x] Manual mode — `agentlens.focusMode: "notify"` shows a notification (`<agent> is about to edit <file>.`) with an Open button instead of opening the file; Open uses a preview tab and takes input focus because the user asked for it. Shares the cooldown and latest-wins queue. Replaces the boolean `agentlens.autoFocus` (never released, no migration). Unit-tested (291) and integration-tested that notify/off record the event without opening; the notification itself and the Open click were not driven in a real window
- [x] Prevent stealing the active editor — in `auto` mode an open is deferred while the user has edited the active document (left unsaved) within the last 3 s; it re-checks every 500 ms, opens only the latest requested file once they stop, and is dropped after 10 s of continuous typing. Notifications are never deferred. Unit-tested with fake timers (305) and integration-tested by typing into a real editor (the test failed before the dirty-flag fix, so it does detect the behaviour). Not detected: typing in the terminal, a clean active document, or other windows (VS Code exposes no API for those)
- [x] Tab safety evaluation — pure `selectTabsToClose` (oldest-first, only AgentLens-opened tabs, skips pinned/dirty/active/protected/duplicated, may leave the limit exceeded) plus `TabController` (serialised passes, close and protected-key failures reported and nothing closed); policy in ADR-005
- [x] Max tabs setting (default 5) — `agentlens.maxTabs` is read on every pass; a value below 1 acts as 1
- [x] Never close pinned/dirty/active/agent-working tabs — unit-tested for each rule; integration-tested for active and pinned tabs and for leaving the user's own tab alone. A dirty tab was not driven in a real window (closing one opens a modal dialog), only unit-tested
- [x] Test VS Code API constraints — findings recorded in ADR-005; `tabGroups.close` verified in the 1.145.2 host only, not on the declared minimum 1.90

**Exit criteria:** Focus and tab management cause no data loss and do not unnecessarily disrupt the user.

**Evidence:** `npm test` 334 passed | 1 skipped; `test:integration` 20/20 in a real Extension Development Host, including typing deferral, notify/off, tab trimming and a pinned tab. No data-loss path was found, but the criterion is judged on automated tests only: no manual session with a real agent and a real user typing, one VS Code version, Windows only.

## Phase 6 — More Integrations and Hardening

- [ ] Explore Codex integration based on actual API
- [ ] Explore Cursor integration based on actual API
- [ ] Generic adapter contract
- [x] Multi-agent / multi-session tests — unit-level pipeline tests with interleaved Claude Code sessions, a second agent, filesystem observations, duplicates, rejections and a failing listener; no real second agent has been run
- [ ] Performance and resource usage review — core pipeline measured: 50,000 events in about 200 ms (about 250,000 events/s), heap delta under 1 MB, history capped at 500. Not measured: VS Code watcher and `stat` cost during a large burst (for example a branch checkout), and tree refresh cost under a burst
- [ ] Security review — self-review against the SECURITY.md checklist done (8 of 9 items ticked there); an independent review and the adapter transport review are still pending
- [x] Packaging and release checklist — `RELEASE.md`; a local VSIX builds (7 files). Publishing is blocked on the owner providing a publisher, a LICENSE and a Marketplace icon

## Definition of Done

A feature is considered done when:
- Acceptance criteria pass.
- Relevant tests pass.
- No known critical bugs remain.
- Diff has been reviewed.
- Documentation is updated to match the code.
- Commits are clearly separated.
