# Architecture Decision Records

Records of key decisions made in AgentLens, so that AI and other contributors understand the original reasoning and do not revisit the same decisions unnecessarily.

## ADR-001: TypeScript and VS Code Extension API

**Status:** Accepted

**Decision:** Use TypeScript and the VS Code Extension API as the foundation.

**Reason:**
- Standard stack for VS Code Extensions.
- Provides access to Workspace, Editor, TreeView, Commands, and FileSystemWatcher.
- Minimizes the number of runtimes and infrastructure components to maintain.

## ADR-002: Agent-agnostic Core

**Status:** Accepted

**Decision:** Separate Agent-specific integrations from the Core through Adapters.

**Reason:** Supports multiple Agents without coupling the Core to any single provider's API.

## ADR-003: Pre-edit Adapter plus Filesystem Fallback

**Status:** Accepted

**Decision:** Use pre-edit hooks/events when an Agent supports them, and use FileSystemWatcher as a fallback.

**Reason:** FileSystemWatcher detects changes after they occur and therefore cannot substitute for a true pre-edit event.

## ADR-004: Local-first

**Status:** Accepted

**Decision:** Store event metadata on-device and never send Source Code externally.

**Reason:** Reduces privacy and security risk.

## ADR-005: Safe Tab Management

**Status:** Accepted

**Decision:** Target a default of 5 open tabs, but do not force-close tabs when it is not safe to do so. AgentLens closes only tabs it opened itself, oldest first, and never one that is pinned, dirty, active, open in more than one tab, or the file an agent session is working on. The limit counts every tab, so it can stay exceeded when nothing is safe to close.

**Reason:** Prevents loss of unsaved work and avoids disrupting the user. VS Code does not say who opened a tab, so "tabs the user opened" cannot be told apart from "tabs the agent opened" after the fact; recording what AgentLens opened is the only way to leave the user's tabs alone.

**Verified API constraints (VS Code 1.145.2 host; `@types/vscode` 1.90):**
- `window.tabGroups.close(tab | tabs, preserveFocus)` exists and closed the targeted tabs in the integration test.
- `Tab` exposes `isActive`, `isDirty`, `isPinned`, `isPreview` and, for plain text tabs, the file URI through `TabInputText`. Other tab kinds have no file key and are never closed, but still count toward the limit.
- Closing a dirty tab opens a confirmation dialog, so dirty tabs are never passed to `close`. A tab that turns dirty between the check and the call is still guarded by that dialog.
- `preview: true` is ignored when the user disabled preview editors, so every opened file then becomes a permanent tab. That is when trimming matters.
- The tab model can lag behind `showTextDocument`: the new tab may be missing from `tabGroups` for a moment after the call returns. AgentLens waits up to 1 s for the tab to appear before trimming and forgets an owned tab only after it has been seen and has then gone. One integration run failed intermittently before this was added (the old tab was not closed); the race is the suspected cause and was not reproduced on demand, but four later full runs all passed.

**Consequences:** A file the user already had open is never registered as ours. A file the user later keeps (double-click) stays registered and can still be trimmed unless pinned or edited. Only the 1.145.2 host was exercised; the declared minimum (1.90) was not.

## ADR-006: Adapters Are Parsers, Transports Are Separate

**Status:** Accepted

**Decision:** An adapter implements `parse(payload, now)` and nothing else. Receiving payloads (the hook script and local socket for Claude Code, the file watcher for the fallback) is done by transports that are not part of the adapter contract. Adapters run through `runAdapter`, which converts exceptions and invalid return values into a reported `failed` result.

**Reason:** The initial proposal (`start`, `stop`, `onEvent`) had no second implementation to justify it, and the one real integration needs a transport that is shared plumbing (endpoint, size limits, timeouts), not adapter logic. A pure parser is easy to test with real payloads and cannot touch the file system or VS Code.

**Consequences:** An agent whose events cannot be delivered as a payload to a parser would need a new transport design and a new ADR. Only one adapter exists, so the contract has not been tested against a second agent's shape.
