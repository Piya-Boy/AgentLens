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
- [x] Event validation and path normalization — lexical only (absolute path, `..` collapse, workspace boundary, size limits); symlink resolution per SECURITY §2 is not implemented yet
- [x] Event Manager — validate and dispatch with listener error isolation; not wired into the extension yet
- [x] Session Manager — in-memory, keyed by agent and session id, capped at 50 sessions (least recently updated evicted); not wired into the extension or persisted yet
- [x] Event deduplication — same event id per agent/session, or identical content within a 500 ms window; bounded to 1000 entries; wired into Event Manager. The 500 ms window is a proposed default, not validated against a real agent
- [x] Mock event command for testing — `AgentLens: Send Mock Pre-edit Event for Active File`; Event Manager and Session Manager are wired into the extension; events are recorded but no file is opened until the Focus Controller lands
- [x] Focus Controller — opens the file (preview tab, without taking input focus) only for adapter events with status `started` and action `edit`; honours `agentlens.autoFocus`; open errors are reported, not thrown. No queue/debounce yet (Phase 5)
- [x] Auto Focus / Pause / Resume — auto focus on/off via the `agentlens.autoFocus` setting (no toggle command); `AgentLens: Pause Auto Focus` / `Resume Auto Focus` commands; pause is in-memory (resets on reload) and events are still recorded while paused

**Exit criteria:** Sending a mock pre-edit event successfully opens the correct file safely.

**Evidence:** `test:integration` (8/8, real Extension Development Host with a fixture workspace) shows a mock pre-edit event makes the fixture file visible, an event outside the workspace is rejected, and nothing opens while disabled or paused. Unit tests: 109/109. Not yet covered: symlinks, a real agent adapter, queue/debounce.

## Phase 2 — Filesystem Fallback

- [x] Implement FileSystemWatcher — one `**/*` watcher via `createFileSystemWatcher`; directories are skipped
- [x] Detect create/change/delete — mapped to actions create/edit/delete; integration test covers a file created, appended and removed
- [x] Distinguish filesystem observations from agent events — source `filesystem`, status `observed`, agent `unknown`; the Focus Controller never acts on them
- [x] Workspace boundary validation — enforced by the shared event validator for filesystem events too (lexical; symlinks still unresolved)
- [x] Ignore patterns and debounce — folders from `agentlens.ignoredFolders` (default `.git`, `node_modules`) at any depth; 200 ms per-file debounce plus the 500 ms deduplication window
- [ ] Test files modified from Terminal/WSL — only simulated with a Node.js writer inside the integration test; no real terminal, PowerShell or WSL run yet

**Exit criteria:** Changes made outside VS Code are detected without claiming them as pre-edit events.

**Evidence:** `test:integration` (9/9) shows a file created, appended and deleted on disk is recorded as `observed` by agent `unknown`, and is not opened. Unit tests: 129/129. Not covered: real Terminal/PowerShell/WSL writers, large bursts, symlinks.

## Phase 3 — First Agent Integration

- [ ] Review current Claude Code hook/event documentation
- [ ] Design adapter based on actual payload structure
- [ ] Receive pre-edit events
- [ ] Map session and tool name
- [ ] Handle timeout, malformed payload, and duplicate events
- [ ] End-to-end testing

**Exit criteria:** Test evidence confirms events arrive before edits and the file opens before the Agent acts.

## Phase 4 — Activity UI

- [ ] AgentLens Activity Bar
- [ ] Active Agents / Sessions view
- [ ] Recent Activity TreeView
- [ ] StatusBar
- [ ] Event history
- [ ] Filter by Agent, Session, and Action

**Exit criteria:** Users can inspect activity and status from the UI.

## Phase 5 — Smart Focus and Tab Management

- [ ] Focus queue and arbitration
- [ ] Debounce / cooldown
- [ ] Manual mode
- [ ] Prevent stealing the active editor
- [ ] Tab safety evaluation
- [ ] Max tabs setting (default 5)
- [ ] Never close pinned/dirty/active/agent-working tabs
- [ ] Test VS Code API constraints

**Exit criteria:** Focus and tab management cause no data loss and do not unnecessarily disrupt the user.

## Phase 6 — More Integrations and Hardening

- [ ] Explore Codex integration based on actual API
- [ ] Explore Cursor integration based on actual API
- [ ] Generic adapter contract
- [ ] Multi-agent / multi-session tests
- [ ] Performance and resource usage review
- [ ] Security review
- [ ] Packaging and release checklist

## Definition of Done

A feature is considered done when:
- Acceptance criteria pass.
- Relevant tests pass.
- No known critical bugs remain.
- Diff has been reviewed.
- Documentation is updated to match the code.
- Commits are clearly separated.
