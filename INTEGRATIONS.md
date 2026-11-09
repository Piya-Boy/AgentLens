# Agent Integrations

What AgentLens can and cannot get from each agent, based on the agent's own documentation. Nothing here is implemented except Claude Code. Read dates are 2026-11-09. Hook documentation changes quickly: re-check before building.

How to read the status words:
- **Verified** — seen in a real run on this project.
- **Documented** — stated on the vendor's official page.
- **Summary only** — the page was fetched by a tool that returned part of it as a model summary instead of verbatim text. Treat as unconfirmed.
- **Not stated** — the page does not say.

## Requirements an integration must meet

1. An event before the agent changes the file, with an absolute file path and a session identifier.
2. Delivery that never blocks or delays the agent (notify-only, exit 0, no output).
3. No file content leaves the agent process: the hook reduces the payload to ids and paths before anything is sent (see `SECURITY.md`).
4. A way to install it that the user confirms, scoped to the project when possible.

## Claude Code — implemented

- Event: `PreToolUse` for `Edit` and `Write`. **Verified** with Claude Code 2.1.319: it fired 63 ms before the file was created; the payload has `tool_input.file_path` (absolute), `session_id`, `tool_use_id` (see `TESTING.md`).
- Install: `AgentLens: Install Claude Code Hook` writes `.claude/settings.local.json` after a modal confirmation.
- Transport: Node hook script, then a per-user local socket.

## Codex (OpenAI)

Source: `https://developers.openai.com/codex/hooks`, which redirects to `https://learn.chatgpt.com/docs/hooks`. About half of the page came back verbatim; the rest as a summary.

| Question | Finding | Status |
| --- | --- | --- |
| Is there a pre-action hook? | `PreToolUse` runs before a tool call. There are 14 events in total. | Documented |
| Does it cover file edits? | Yes through `apply_patch`: a matcher of `apply_patch`, `Edit` or `Write` matches it, and the input still reports `tool_name: "apply_patch"`. | Summary only |
| Payload fields | `session_id`, `transcript_path`, `cwd`, `hook_event_name`, `model`, `permission_mode`, `turn_id`, `tool_name`, `tool_use_id`, `tool_input`. | Summary only |
| Where is the file path? | No dedicated file-path field. For `apply_patch` the patch text is in `tool_input.command`. The page does not describe the patch format. | Summary only; shape of `apply_patch` input not stated |
| Notify-only | "Exit `0` with no output is treated as success and Codex continues." | Summary only |
| Configuration | `<repo>/.codex/hooks.json` or `config.toml`, plus the same files under `~/.codex/`. | Summary only |
| Trust | "Project-local hooks load only when the project `.codex/` layer is trusted." Non-managed hooks "must be reviewed and trusted before they run." | Documented |
| Windows | A `command_windows` override exists; no other statement. | Summary only |

Assessment: feasible in principle. The hard parts are specific to Codex:
- The file path is inside the patch text, so the hook script would have to parse the patch to find paths. That means parsing a format this project has not seen a real example of.
- That patch text contains the new file content. The hook must extract paths locally and drop the text before forwarding, which the current forwarding code does not do for this shape.
- A project hook only runs after the user trusts it inside Codex, so the installer cannot make it work on its own.

To unblock: install a logging hook in a scratch project, run a real Codex session that edits and creates files, and capture the actual `PreToolUse` payload for `apply_patch` (creation, edit, delete, rename, several files in one patch). Then write the parser against those captures, as was done for Claude Code.

## Cursor

Source: `https://cursor.com/docs/agent/hooks`. About 40 000 of 69 000 characters came back verbatim; the rest as a summary.

| Question | Finding | Status |
| --- | --- | --- |
| Is there a pre-edit hook? | There is no dedicated one. `afterFileEdit` runs after the edit. `preToolUse` runs before any tool and its matchers include `Write`; the page does not say outright that it fires before each file write. | Documented; the pre-write behaviour is an inference |
| `afterFileEdit` payload | `file_path` (absolute) and `edits` (`old_string`, `new_string`). | Summary only |
| Common payload | `conversation_id`, `generation_id`, `model`, `hook_event_name`, `cursor_version`, `workspace_roots`, `user_email`, `transcript_path`. | Documented |
| `preToolUse` payload | `tool_name`, `tool_input`, `tool_use_id`, `cwd`, `agent_message`. Whether `tool_input` for `Write` has a file path is not stated. | Summary only |
| Notify-only | Exit 0 is success. Other non-2 exit codes fail open by default. `failClosed` is off by default. | Documented |
| Configuration | `<project>/.cursor/hooks.json`, `~/.cursor/hooks.json`, enterprise and team locations. Format: `{ "version": 1, "hooks": { "<event>": [{ "command": "...", "matcher": "..." }] } }`. Hooks reload automatically. | Documented |
| Windows | The desktop app runs hook commands through PowerShell and pipes the JSON to them. | Documented |
| Cloud agents | Project hooks run there; user-level hooks do not. | Documented |
| Cursor CLI | Not stated. | Not stated |
| Extensions in Cursor | Not stated on this page. | Not stated |

Assessment: partly feasible.
- `afterFileEdit` gives a reliable path but only after the change, which cannot meet requirement 1. It would be treated like the filesystem fallback (observed, never focus).
- `preToolUse` with a `Write` matcher might give a true pre-edit event, but the payload of a `Write` call has not been confirmed.
- Cursor is itself a VS Code based editor. Whether AgentLens installs and runs there, and whether it can reach the same project hook, has not been checked.

To unblock: in a scratch Cursor project, register a logging `preToolUse` hook matching `Write` and an `afterFileEdit` hook, run a real agent edit, and record order, timing and payloads.

## Generic fallback

Any agent without a usable hook is already covered by the filesystem fallback, which shows what changed but never claims it was announced in advance (ADR-003).

## Not explored

Other agents (Gemini CLI, Copilot agent mode, Aider and so on) were not looked at.
