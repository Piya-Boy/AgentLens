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
- [TESTING.md](TESTING.md) — Testing Guidelines
- [DECISIONS.md](DECISIONS.md) — Architecture Decision Records

## Status

The project is in the foundation and MVP development phase. Any details not yet confirmed should be treated as proposals, not completed capabilities.
