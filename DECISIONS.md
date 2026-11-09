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

**Consequences:** A file the user already had open is never registered as ours. A file the user later keeps (double-click) stays registered and can still be trimmed unless pinned or edited. The full integration suite (including the tab tests) passes on both the 1.145.2 host and the declared minimum, 1.90.0 (report in `TESTING.md`).

## ADR-006: Adapters Are Parsers, Transports Are Separate

**Status:** Accepted

**Decision:** An adapter implements `parse(payload, now)` and nothing else. Receiving payloads (the hook script and local socket for Claude Code, the file watcher for the fallback) is done by transports that are not part of the adapter contract. Adapters run through `runAdapter`, which converts exceptions and invalid return values into a reported `failed` result.

**Reason:** The initial proposal (`start`, `stop`, `onEvent`) had no second implementation to justify it, and the one real integration needs a transport that is shared plumbing (endpoint, size limits, timeouts), not adapter logic. A pure parser is easy to test with real payloads and cannot touch the file system or VS Code.

**Consequences:** An agent whose events cannot be delivered as a payload to a parser would need a new transport design and a new ADR. Only one adapter exists, so the contract has not been tested against a second agent's shape.

## ADR-007: Update Check Is Notify-Only and Opt-In

**Status:** Accepted

**Decision:** AgentLens does not download or install its own updates. It can compare the installed version with the latest GitHub release of `Piya-Boy/AgentLens` and tell the user, with a button that opens the release page. The command `AgentLens: Check for Updates` always works. The automatic check, `agentlens.checkForUpdates`, is off by default; when on it runs about 10 seconds after start-up, at most once a day (`globalState`), and reports each version once. The request is one anonymous `GET` to `api.github.com` with a user agent, no redirects, a 5 s timeout and a 64 KiB limit. Only `tag_name` is read: it must be a plain `major.minor.patch` (optional leading `v`), and drafts and pre-releases are ignored. The release page link is built from that tag as `https://github.com/Piya-Boy/AgentLens/releases/tag/<tag>`; the response's own URLs are ignored. The setting has `application` scope, so only the user's own settings can turn it on; a repository's `.vscode/settings.json` cannot.

**Reason:** VS Code already updates extensions installed from the Marketplace, so a second installer would add risk without benefit. Fetching and installing code from a network response would turn an extension that today uploads nothing into one that runs downloaded code, and it would need signature checking this project cannot provide. A notice costs one small request and cannot change what runs. It is opt-in because the extension had no network call before, and `SECURITY.md` promised none.

**Consequences:** A VSIX installed by hand still needs a new VSIX. The first network call in `src/` (`src/update/github-fetch.ts`) means the "no network" claim in the docs and the security checklist changed to name that one call. GitHub sees the user's IP address and the extension version in the user agent. Until a release is published the check answers HTTP 404. A Marketplace listing, once it exists, makes the notice mostly redundant, and the setting can then be removed.

## ADR-008: The Hook Entry Points at a Stable Copy of the Script

**Status:** Accepted

**Decision:** The Claude Code hook entry runs `node "<state folder>/hook.js" --agentlens`, where the state folder is the one that already holds the endpoint secret (`%LOCALAPPDATA%\agentlens` on Windows, `$XDG_STATE_HOME/agentlens` or `~/.local/state/agentlens` elsewhere). Each time the extension activates it makes that file an exact copy of its bundled `dist/hook.js`: written whole to a temporary file and renamed into place, left alone when identical, and refused (not written through) when the state folder or the file is a link, not the expected kind, owned by another user, or (Unix) writable by others. Folder and file are both checked because Claude Code runs the script without checking it: anyone who could replace the file or rename another into its folder would run code as the user. The install command deploys the copy first and writes the settings entry only after that succeeded. The extension now activates on `onStartupFinished`; before, nothing started it until the user opened its view.

**Reason:** VS Code puts every extension version in a new folder. An entry that names the bundled script stops working after an update, and because the hook never blocks or reports, nothing shows that it broke. Alternatives rejected: detecting a stale path and asking the user (still silent until the user acts and the prompt appears), rewriting `.claude/settings.local.json` automatically on activation (changes a user's agent configuration in every workspace without confirmation, which `SECURITY.md` forbids), and a stub that searches the extensions folder for the newest version (breaks with `--extensions-dir`, Insiders, portable and remote installs). A copy beside the secret needs no search and no repeated edits.

**Consequences:** The hook entry is written once and stays valid. The script is code that Claude Code runs from a user-level folder instead of from the extension; it has the same trust as the secret beside it (the user's profile rights on Windows, owner and mode checks on Unix). An edited copy is restored on the next activation, but until then it runs; the folder check is what stops a stranger from planting one. A folder that is a link (for example a relocated state folder) is refused, and the user must fix or recreate it. Two editors with different extension versions (for example VS Code and Insiders) share the copy and the one that activated last wins, so the message format must stay compatible across versions. The copy stays after the hook or the extension is uninstalled and sends nothing without a listener. Entries written by builds before this one still name the versioned folder and need one reinstall; no migration is written because no build has been published. Windows replaces a file that another process has open only if that process opened it with delete sharing; if the rename fails and the target already holds the same script (another window just wrote it) that counts as done; otherwise the old copy stays and the error is logged. Activating on startup (a related fix) means every window now starts its listener and file watcher and writes the secret and this copy, also for users who never install the hook.
