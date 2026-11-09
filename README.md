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
- Operate entirely on-device — no Source Code is sent to external services

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

Press F5 (`Run Extension`) to launch the Extension Development Host. Commands: `AgentLens: Enable`, `AgentLens: Disable`, `AgentLens: Pause Auto Focus`, `AgentLens: Resume Auto Focus`, `AgentLens: Send Mock Pre-edit Event for Active File` (development aid; the event is validated, deduplicated and recorded in the output channel and session list).

The enabled/disabled state is stored in the workspace's `workspaceState`, so AgentLens never writes to `.vscode/settings.json`. `agentlens.focusMode` controls what a pre-edit event does: `auto` opens the file in a preview tab (default), `notify` shows a notification with an Open button, `off` does neither (activity is still recorded). In `auto` mode the open waits while you are typing in the active editor (an unsaved edit in the last 3 seconds) and is dropped if you keep typing for 10 seconds. `agentlens.maxTabs` (default 5) is a target: after AgentLens opens a file it closes the oldest tabs it opened itself until the target is met, never one that is pinned, unsaved, active, open twice or in use by an agent session, and never a tab you opened. If nothing is safe to close the target is exceeded.

## Claude Code integration

AgentLens learns about edits before they happen through a Claude Code `PreToolUse` hook (`Edit` and `Write`).

1. Open your project folder in VS Code.
2. Run `AgentLens: Install Claude Code Hook` and confirm. It merges one entry into `.claude/settings.local.json` of the first workspace folder and keeps everything else.
3. Start Claude Code in that folder, including from an external terminal. Files it is about to edit open in a preview tab.

- The hook is a small `node` script (`dist/hook.js`), so `node` must be on your PATH. It never blocks Claude Code, always exits 0 and prints nothing.
- It sends only the file path, session id, tool name and working directory to this VS Code window over a local socket (a named pipe on Windows) whose name is derived from a random per-user secret kept in `%LOCALAPPDATA%\agentlens\endpoint-secret` (Windows, protected by the access rights of your user profile) or `~/.local/state/agentlens/endpoint-secret` (Unix, mode 0600 and owner checked); the hook sends nothing if that file does not exist. File contents are dropped before leaving the hook. Nothing uses the network.
- After the extension is updated its folder changes; run the install command again to refresh the path.
- `AgentLens: Uninstall Claude Code Hook` removes only the AgentLens entry.
- Tested with the documented payload format, the real hook script, and a real Claude Code 2.1.319 session (see `TESTING.md`). A single run with a live VS Code window, the installed hook and a live session together has not been recorded.

## Status

The project is in the foundation and MVP development phase. Any details not yet confirmed should be treated as proposals, not completed capabilities.
