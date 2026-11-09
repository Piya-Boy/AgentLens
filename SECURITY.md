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
- [x] Payload validation — event validator and Claude Code payload parser with size limits on ids and paths; the hook transport also limits a message to 16 KiB on both the sending and the receiving side
- [x] No source-code upload — no network, process or eval APIs in `src/` (checked by search on 2026-11-09); the only network use is the VS Code download of the integration test runner
- [x] No secret logging — the output channel records paths, ids and tool names only; the Claude Code parser never copies `tool_input` content (tested)
- [x] Safe storage — the only persisted value is the enabled flag in `workspaceState`; history and sessions are in memory and capped
- [x] Adapter failure isolation — listener errors are isolated; `runAdapter` turns a throwing or malformed adapter into a reported `failed` result (unit-tested, including that a healthy adapter keeps working after a broken one). Only one real adapter exists, so isolation between two real adapters is tested with a fake
- [x] No unsafe shell execution — no child process APIs in `src/`
- [x] User configuration changes are explicit — the extension writes no VS Code settings. The only agent configuration it writes is the Claude Code hook entry in `.claude/settings.local.json`, after a modal confirmation that shows the file and the exact command. The installer refuses a linked `.claude` folder or settings file, writes through a random exclusive temporary file, keeps the existing file mode (new files are 0600), refuses extension paths a shell would expand, and uninstall removes only the exact AgentLens command

## 8. Review Log

### 2026-11-09 — independent review by a read-only security agent

Code was read, nothing was run; Unix socket behaviour, the real named-pipe ACL and Windows device or 8.3 names could not be assessed. This is an AI review, not a human penetration test.

| # | Severity | Finding | Status |
| --- | --- | --- | --- |
| 1 | medium | The hook endpoint name is a hash of a public path, so another local user could take the name and receive events, or stop the real listener from starting | open |
| 2 | low | On Linux without `XDG_RUNTIME_DIR` the hook trusts a socket folder another user may have created first | open (covered by 1) |
| 3 | medium | The installer's fixed temporary name followed symlinks and `.claude` was not checked | fixed |
| 4 | low | Rewriting settings loosened the file mode | fixed |
| 5 | low | Hook command quoting unsafe for paths containing `"`, backtick, `$`, `%`, `!` | fixed (install refuses such paths) |
| 6 | low | Uninstall matched any command containing the marker | fixed (exact match on the trailing marker) |
| 7 | low | A tool name with newlines could forge lines in the output channel | open |
| 8 | low | The connection timeout reset on every byte and connections were not capped | open |
| 9 | low | A path can be swapped for a symlink between the real-path check and the open | accepted: the file is only shown, never sent anywhere, and the attacker already needs write access to the workspace |
| 10 | low | SECURITY.md and README were out of date | fixed |

Accepted by design: any process running as the same user can send events to the socket. Such events can only open files inside the workspace in a preview tab and add fake activity entries.
