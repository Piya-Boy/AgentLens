# Architecture — AgentLens

## 1. Principles

- Agent-agnostic Core
- Adapter-based integrations
- Event-driven architecture
- Local-first and privacy by default
- Safe editor interaction
- Explicit distinction between pre-edit events and filesystem observations

## 2. Recommended Stack

- TypeScript
- Node.js runtime provided by VS Code Extension Host
- VS Code Extension API
- esbuild
- ESLint
- Vitest for unit tests
- `@vscode/test-electron` for extension integration tests

No Backend, Database Server, Docker, or React is required for MVP.

## 3. High-level Flow

```text
Agent Hooks / Adapters ─┐
                        ├─> Event Normalizer ─> Event Validator
Filesystem Watcher ─────┘                         |
                                                  v
                                            Event Manager
                                                  |
                       ┌──────────────────────────┼───────────────────┐
                       v                          v                   v
                 Session Manager            Activity Store      Focus Queue
                       |                          |                   |
                       v                          v                   v
                 Agent Registry              Sidebar UI        Focus Controller
                                                                      |
                                                                      v
                                                               VS Code Editor
```

## 4. Suggested Project Structure

```text
src/
├── extension.ts
├── core/
│   ├── event-manager.ts
│   ├── activity-manager.ts
│   ├── session-manager.ts
│   └── workspace-manager.ts
├── detectors/
│   └── filesystem-detector.ts
├── adapters/
│   ├── adapter.interface.ts
│   ├── claude/
│   ├── codex/
│   └── generic/
├── controllers/
│   ├── focus-controller.ts
│   └── tab-controller.ts
├── providers/
│   └── activity-tree.ts
├── services/
│   ├── event-queue.ts
│   └── history-service.ts
├── models/
│   └── agent-file-event.ts
└── utils/
    ├── path-utils.ts
    └── logger.ts
```

Adjust the structure to match the actual implementation size. Do not create files or abstractions before they are needed.

## 5. Adapter Contract

An Adapter is responsible for translating Agent-specific events into the shared `AgentFileEvent` format.

```ts
interface AgentAdapter {
  readonly id: string;
  parse(payload: unknown, now: number): AdapterParseResult; // { ok: true, event } | { ok: false, reason, detail }
}
```

Implemented in `src/adapters/adapter.ts`. The first integration showed that an adapter is a pure translator and that the lifecycle (start, stop, listening) belongs to the transport, so the earlier `start`/`stop`/`onEvent` proposal was dropped (ADR-006). `runAdapter` calls `parse` and turns a thrown error or a malformed return value into a `failed` result, which the caller logs; one broken adapter therefore cannot stop the transport or other adapters. The Claude Code adapter is `claudeCodeAdapter`.

Adding an agent means: a parser that implements `AgentAdapter` and never copies file content, a transport the agent actually offers (verified against its documentation), and tests with real payloads.

## 6. Event Pipeline

1. Receive event from an adapter or filesystem detector.
2. Normalize the file path.
3. Validate workspace boundary.
4. Validate required fields and source.
5. Deduplicate.
6. Update session/activity state.
7. Enqueue the event for focus handling according to policy.
8. Update Sidebar/StatusBar.

## 7. Focus Controller

Receives only validated events:
- Check the focus mode (`auto`, `notify`, `off`) and Pause state.
- Determine whether the event warrants a focus action.
- Queue and debounce.
- Open the document and show the editor, or offer it in a notification in `notify` mode.
- Handle errors such as file missing, permission denied, or unsupported URI.

Filesystem fallback events must never be interpreted as pre-edit events.

## 8. Tab Controller

Responsible for evaluating which tabs can be safely managed:
- Check pinned, dirty, active, and agent-owned status. Only tabs AgentLens opened are candidates (`OwnedTabs`); `selectTabsToClose` is the pure policy.
- Use only APIs/commands that actually exist and have been tested.
- When safety cannot be confirmed, do not close the tab.
- Keep Tab Management separate from Focus Controller.

## 9. Storage

Start with VS Code `workspaceState` / `globalState` or appropriate storage for history data.
- Do not store Source Code.
- Limit the number of retained history events.
- Support workspace separation.
- Handle schema versioning when migrations are needed.

## 10. Error Handling and Logging

- Use structured logs.
- Do not log Source Code or secrets.
- Separate errors by domain: adapter, filesystem, focus, and storage.
- The Extension must not crash entirely due to a single adapter failure.
