# Git Workflow

## 1. Core Rule

**One Feature = One Commit + Push**

Each commit must clearly describe its changes and must not mix unrelated work.

## 2. Branch Naming

Use the following patterns:
- `feature/<short-name>`
- `bugfix/<short-name>`
- `refactor/<short-name>`
- `docs/<short-name>`
- `test/<short-name>`
- `chore/<short-name>`

Examples:
- `feature/core-event-manager`
- `feature/claude-pre-edit-adapter`
- `bugfix/path-validation`
- `docs/agent-workflow`

## 3. Commit Convention

Use Conventional Commits:
- `feat: add core event manager`
- `fix: validate workspace file paths`
- `refactor: separate focus controller`
- `docs: add agent integration guide`
- `test: cover event deduplication`
- `chore: configure extension build`

Write messages that communicate the outcome. Avoid vague messages like `update`, `changes`, or `fix stuff`.

## 4. Before Commit

1. `git status`
2. Review `git diff`
3. Review staged files with `git diff --cached`
4. Confirm no secrets, tokens, local configs, or generated files are staged
5. Run relevant tests
6. Stage only files belonging to the current task

## 5. Push Rules

- Push to the task branch; do not push directly to main without a reason or agreement.
- Verify the remote and branch before pushing.
- If the remote has new commits, review and reconcile safely.
- Do not force push without authorization.
- Do not use `reset --hard`, `clean -fd`, or other destructive commands without authorization.

## 6. Existing User Changes

If changes not related to the current task are found:
- Do not overwrite or revert them.
- Do not stage everything blindly.
- Separate the current task's files from user changes.
- Notify the project owner if scope cannot be safely separated.
