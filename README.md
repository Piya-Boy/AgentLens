# AgentLens

Universal AI Agent File Monitor for VS Code

AgentLens tracks the activity of AI Coding Agents that modify files within your Workspace, helps open or focus files the Agent is currently working on, and displays an Activity Timeline. Designed to operate fully Local-first.

## Goals

- Detect file activity from multiple AI Agents
- Support Agents running from Terminal, PowerShell, WSL, or outside VS Code
- Open files the Agent is about to edit so the user can observe, when reliable pre-edit data is available
- Use FileSystemWatcher as a fallback to detect changes after they occur
- Display Agent, Session, Action, File, and timestamp in the Activity Sidebar
- Provide Smart Focus and Smart Tab Management that do not disrupt the user's workflow
- Operate on-device — no Source Code or Workspace data is sent to external services (the only network request is the optional update check, off by default)

## Core Principles

1. **Pre-edit first:** Prioritize pre-edit events from Agent integrations that genuinely support them.
2. **Filesystem fallback:** Use FileSystemWatcher to detect changes after the fact, and always label it clearly as a fallback.
3. **Safe by default:** Never cause data loss or take control of the Editor without good reason.
4. **Agent-agnostic core:** The Core must not be coupled to any single Agent.
5. **Local-first:** No Source Code or Workspace data is sent off-device.
6. **Evidence-based:** Never claim support for an Agent or API without verified documentation and real testing.

## Project Documents

- [AGENTS.md](AGENTS.md) — Rules for AI Coding Agents
- [PRD.md](PRD.md) — Product Requirements
- [ARCHITECTURE.md](ARCHITECTURE.md) — Structure and Architecture
- [ROADMAP.md](ROADMAP.md) — Development Plan
- [WORKFLOW.md](WORKFLOW.md) — How to Work with AI
- [GIT.md](GIT.md) — Branch, Commit, and Push
- [SECURITY.md](SECURITY.md) — Security and Privacy
- [INTEGRATIONS.md](INTEGRATIONS.md) — What each agent offers
- [TESTING.md](TESTING.md) — Testing Guidelines
- [DECISIONS.md](DECISIONS.md) — Architecture Decision Records
- [RELEASE.md](RELEASE.md) — Packaging and release checklist

## Development

Requires Node.js >= 22.12 and VS Code >= 1.90.

```text
npm install
npm run build              # bundle src/extension.ts to dist/extension.js
npm run typecheck
npm run lint
npm test                   # unit tests (Vitest, no VS Code dependency)
npm run test:integration   # runs inside an Extension Development Host; downloads VS Code into .vscode-test/
                           # set VSCODE_TEST_VERSION=1.90.0 to run on the declared minimum
```

Press F5 (`Run Extension`) to launch the Extension Development Host. Commands: `AgentLens: Enable`, `AgentLens: Disable`, `AgentLens: Pause Auto Focus`, `AgentLens: Resume Auto Focus`, `AgentLens: Check for Updates` (see [Updates](#updates)), `AgentLens: Send Mock Pre-edit Event for Active File` (development aid; the event is validated, deduplicated and recorded in the output channel and session list).

The enabled/disabled state is stored in the workspace's `workspaceState`, so AgentLens never writes to `.vscode/settings.json`. `agentlens.focusMode` controls what a pre-edit event does: `auto` opens the file in a preview tab (default), `notify` shows a notification with an Open button, `off` does neither (activity is still recorded). In `auto` mode the open waits while you are typing in the active editor (an unsaved edit in the last 3 seconds) and is dropped if you keep typing for 10 seconds. `agentlens.maxTabs` (default 5) is a target: after AgentLens opens a file it closes the oldest tabs it opened itself until the target is met, never one that is pinned, unsaved, active, open twice or in use by an agent session, and never a tab you opened. If nothing is safe to close the target is exceeded.

## Claude Code integration

AgentLens learns about edits before they happen through a Claude Code `PreToolUse` hook (`Edit` and `Write`).

1. Open your project folder in VS Code. If Claude Code looks to be in use (a `.claude` folder or `CLAUDE.md` in the project, or a `.claude` folder in your home folder), AgentLens asks once per workspace whether to add its hook. Press Install. Nothing is written unless you press it; closing the notice or pressing Don't ask again writes nothing.
2. To do it by hand or later, run `AgentLens: Install Claude Code Hook` and confirm. It merges one entry into `.claude/settings.local.json` of the first workspace folder and keeps everything else.
3. Start Claude Code in that folder, including from an external terminal. Files it is about to edit open in a preview tab. A session that was already open may not see the new hook; restart it if files do not open.

Without the hook AgentLens only records changes after they happen (a fallback) and opens nothing.

- The hook is a small `node` script, so `node` must be on your PATH. It never blocks Claude Code, always exits 0 and prints nothing. The installed entry does not point into the extension's folder, which changes with every version. It points at a copy that AgentLens keeps at `%LOCALAPPDATA%\agentlens\hook.js` (Windows) or `~/.local/state/agentlens/hook.js` (Unix), next to the endpoint secret.
- It sends only the file path, session id, tool name and working directory to this VS Code window over a local socket (a named pipe on Windows) whose name is derived from a random per-user secret kept in `%LOCALAPPDATA%\agentlens\endpoint-secret` (Windows, protected by the access rights of your user profile) or `~/.local/state/agentlens/endpoint-secret` (Unix, mode 0600 and owner checked); the hook sends nothing if that file does not exist. File contents are dropped before leaving the hook. The hook does not use the network.
- On Linux and macOS the socket folder comes from `XDG_RUNTIME_DIR`, or from the temp directory (`TMPDIR`) when that is unset. Claude Code and VS Code must see the same values, otherwise the hook cannot find the window and silently sends nothing.
- When the extension is updated, AgentLens replaces that copy with the new script as soon as VS Code has started, so the entry in `.claude/settings.local.json` stays valid and you do nothing. Until a window running the new version has started, Claude Code keeps using the previous copy. An entry written by an earlier build still points into the old versioned folder; run `AgentLens: Install Claude Code Hook` once to switch it. The copy is left in place when you uninstall the hook or the extension; delete the `agentlens` folder to remove it.
- `AgentLens: Uninstall Claude Code Hook` removes only the AgentLens entry.
- Tested with the documented payload format, the real hook script, and a real Claude Code 2.1.319 session (see `TESTING.md`). A single run with a live VS Code window, the installed hook and a live session together has not been recorded.

## Updates

AgentLens does not update itself. VS Code updates installed extensions; a VSIX installed by hand needs a new VSIX.

The one thing AgentLens can do is tell you that a newer release exists:

- `AgentLens: Check for Updates` asks GitHub once, when you run it, and shows the result with a button that opens the release page.
- `agentlens.checkForUpdates` (default `false`) does the same automatically, about 10 seconds after start-up and at most once a day, and tells you about each new version once. Only your user settings can turn it on; a repository's `.vscode/settings.json` cannot.
- Each check is one anonymous `GET` of the latest release of `Piya-Boy/AgentLens` on `api.github.com`. It sends no workspace data, only a user agent with the extension version; GitHub sees your IP address. Redirects are refused, the answer is limited to 64 KiB and only the version tag is read; the release page link is built from it.
- It never downloads or installs anything. Drafts and pre-releases are ignored.
- The latest release is [v0.0.2](https://github.com/Piya-Boy/AgentLens/releases/tag/v0.0.2). On 2026-11-11 an anonymous request to the endpoint answered HTTP 200 with that tag (checked with curl, not by running the command in VS Code), so version 0.0.2 should report that it is up to date.

## Status

The project is in the foundation and MVP development phase. Any details not yet confirmed should be treated as proposals, not completed capabilities.
