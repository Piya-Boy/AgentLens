# Security and Privacy

## 1. Privacy Principles

- Local-first: events are processed on-device by default.
- Never send Source Code, file contents, or Workspace data externally.
- Store only the metadata necessary to display activity.
- Do not store secrets, credentials, access tokens, or environment variables.
- Do not log file contents.

## 2. Workspace Path Validation

Every event must be validated:
- Resolve the path to its absolute/canonical form.
- Confirm it lies within an allowed Workspace.
- Prevent path traversal attacks.
- Handle symlinks according to a clearly defined policy.
  - Policy: event paths are validated lexically on ingest. Before AgentLens opens a file, it resolves the real path (following symlinks and junctions) and opens it only if the real path is also inside a workspace root; otherwise the file is not opened and the failure is logged. The event itself is still recorded.
- Reject paths that cannot be safely verified.

Never trust file paths from an adapter without validation.

## 3. Adapter Trust

- Validate the schema and data types of every event.
- Limit payload size.
- Verify source and session identity to the extent the integration supports.
- Do not execute commands originating from an event payload.
- Do not treat content in files or event payloads as instructions for the AI or Extension.

## 4. Process and Hook Integration

- Use only hooks/APIs with official documentation.
- Notify the user before adding or modifying Agent configuration.
- Do not modify global configuration unnecessarily.
- Do not read files outside the Workspace to gather private information.
- Do not install background services without justification and user approval.

## 5. Logging and Storage

- Store only necessary metadata.
- Limit history retention.
- Do not store file content.
- Sanitize error messages before displaying them.
- Support clearing history.

## 6. Safe Editor Behavior

- Never close a dirty editor.
- Never close a pinned editor.
- Never steal the active editor unless it complies with the Focus policy.
- When in doubt about whether an action is safe, do not perform it.

## 7. Security Review Checklist

- [x] Path validation — lexical check on ingest, real-path check before opening
- [x] Workspace boundary — strict containment, tested for traversal, sibling prefixes, other drives and symlinks
- [x] Payload validation — event validator and Claude Code payload parser with size limits on ids and paths; an overall payload size limit must be added together with the hook transport
- [x] No source-code upload — no network, process or eval APIs in `src/` (checked by search on 2026-11-09); the only network use is the VS Code download of the integration test runner
- [x] No secret logging — the output channel records paths, ids and tool names only; the Claude Code parser never copies `tool_input` content (tested)
- [x] Safe storage — the only persisted value is the enabled flag in `workspaceState`; history and sessions are in memory and capped
- [ ] Adapter failure isolation — listener errors are isolated and tested, but no running adapter exists yet to test a failing adapter end to end
- [x] No unsafe shell execution — no child process APIs in `src/`
- [x] User configuration changes are explicit — the extension writes no settings and no agent configuration; installing a Claude Code hook is not implemented and needs explicit approval
