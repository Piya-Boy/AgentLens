# Product Requirements Document — AgentLens

## 1. Product Overview

AgentLens is a VS Code Extension for tracking file activity from AI Coding Agents, helping users see which files an Agent is currently working with.

## 2. Problem

When an AI Agent operates from Terminal, PowerShell, WSL, or tools outside VS Code, users may not know which files are being edited, have to hunt for changed files themselves, and find it difficult to track multiple Agents or Sessions.

## 3. Goals

- Display Agent file activity within the Workspace.
- Focus the file an Agent is about to work on when a reliable pre-edit event is available.
- Support multiple Agents and multiple Sessions.
- Maintain an activity history that can be reviewed.
- Prevent Editor disruption and data loss.
- Operate Local-first.

## 4. Non-goals for MVP

- Not a tool for controlling or commanding AI Agents.
- Does not read or analyze Source Code for quality assessment.
- Does not send workspace data to the Cloud. The only network request is the optional update notice (ADR-007), which sends no workspace data.
- Does not guarantee pre-edit detection for every type of Agent.
- Does not manage Git workflow on behalf of the user.

## 5. Core User Stories

1. As a user, when an Agent begins editing a file, I want VS Code to open that file so I can observe the work.
2. When an Agent works outside VS Code but within the same Workspace, I want AgentLens to detect its activity.
3. When multiple Agents are running, I want to separate activity by Agent and Session.
4. When I do not want the Editor to switch files automatically, I want to disable Auto Focus or Pause it.
5. I want to view an Activity Timeline to know what happened and when.
6. I want the system to never close files with unsaved changes or files currently in use.
7. I want the system to work on-device and not send Source Code anywhere.

## 6. Event Model

A shared `AgentFileEvent` schema is used so that the Core is not coupled to any specific Agent.

```ts
type AgentAction = "read" | "create" | "edit" | "delete";
type AgentEventStatus = "started" | "completed" | "failed" | "observed";

interface AgentFileEvent {
  eventId: string;
  agentId: string;
  sessionId: string;
  action: AgentAction;
  status: AgentEventStatus;
  filePath: string;
  timestamp: number;
  toolName?: string;
  source: "adapter" | "filesystem";
}
```

Events must be validated before entering the Core, and paths must be normalized to a consistent format.

## 7. Detection Strategy

### Pre-edit integrations
- Adapters that support pre-edit hooks/events send a `started` event before the file is opened.
- The API and lifecycle of each Agent must be verified from official documentation.
- Never assume all Agents share the same hook mechanism.

### Filesystem fallback
- Use `vscode.workspace.createFileSystemWatcher`.
- Detect create/change/delete after the change has occurred.
- Mark source as `filesystem` and status as `observed`.
- Never present filesystem events as pre-edit events or attribute them to a specific Agent without evidence.

## 8. Focus Behavior

- When a valid pre-edit event is received and Auto Focus is enabled, open/focus the file.
- For filesystem fallback events, use the user-configured behavior (e.g., notify or add to Timeline without stealing focus — the default).
- Support Pause, Resume, Manual mode, and Auto Focus on/off.
- Debounce and queue focus actions to prevent rapid file switching.
- Always verify that the path is within the Workspace before opening a file.

## 9. Smart Tab Management

Default max tabs = 5, but this is a management target, not a hard rule that forces tabs to close.

Safety rules:
- Never close a pinned tab.
- Never close a dirty/unsaved tab.
- Never close the user's active tab.
- Never close a file an Agent is currently working on.
- Only close tabs AgentLens itself opened (ADR-005); the user's own tabs are never touched.
- If no tab can be safely closed, allow exceeding the configured limit.
- Verify VS Code API constraints before implementing — never claim a general tab-close API exists if it does not.

## 10. UI Requirements

Activity Bar: AgentLens

The Sidebar should display:
- Active Agents
- Session status
- Current file
- Recent Activity
- Auto Focus status
- Pause/Resume control
- Manual/Automatic mode

Use native VS Code TreeView and StatusBar for MVP; Webview is an option when necessary.

## 11. Acceptance Criteria

- Opening a Workspace activates the Extension without errors.
- Receiving a mock event displays it in the Activity view.
- Receiving a pre-edit event from a tested Adapter opens the correct file.
- Filesystem fallback detects create/change/delete.
- Paths outside the Workspace are rejected.
- Pause and Auto Focus off behave as specified.
- Duplicate events are deduplicated according to policy.
- Tab manager does not close protected tabs.
- No Source Code is sent off-device.
- Documentation clearly states the limitations of each detection source.
