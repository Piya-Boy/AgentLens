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

- [ ] Path validation
- [ ] Workspace boundary
- [ ] Payload validation
- [ ] No source-code upload
- [ ] No secret logging
- [ ] Safe storage
- [ ] Adapter failure isolation
- [ ] No unsafe shell execution
- [ ] User configuration changes are explicit
