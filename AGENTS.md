# AGENTS.md — Instructions for AI Coding Agents

This file defines the core rules for every AI that works in this repository. Read it before modifying any code.

## 1. Roles and Responsibilities

- The project owner defines goals, scope, and approves major decisions.
- AI acts as the development team: analyze, plan, write code, test, review, and report.
- Do not unilaterally change Product Scope or Architecture without explaining the rationale and impact.
- When multiple approaches exist, propose the most suitable one with clear pros, cons, and a recommendation.

## 2. Before Starting Any Task

1. Read `README.md`, `PRD.md`, `ARCHITECTURE.md`, `ROADMAP.md`, and any documents relevant to the task.
2. Check Git status with `git status` and confirm the current branch.
3. Explore the actual code before making changes — never infer structure from documents alone.
4. Identify the problem, goal, scope, and files likely to be affected.
5. Verify dependencies and APIs from trusted references when uncertain.
6. Plan in short steps before beginning implementation.

## 3. How to Develop

- Work on one clearly scoped Feature or Bug at a time.
- Avoid fixing unrelated issues in the same pass.
- Preserve the existing project structure and style unless there is a verifiable reason to change it.
- Use TypeScript with explicit types; avoid `any` unless necessary.
- Separate Core logic from Agent-specific adapters.
- Write maintainable code; do not create unnecessary abstractions.
- Do not add dependencies when existing APIs or tools suffice.
- Do not delete or overwrite user files unless necessary.
- Do not change behavior unrelated to the assigned task.

## 4. Prohibitions

- Do not invent APIs, events, hooks, or capabilities without evidence.
- Do not claim tests pass without actually running them.
- Do not silently swallow errors with an empty catch block.
- Do not close files with unsaved changes.
- Do not cause user data loss.
- Do not send Source Code or Workspace data to external services without authorization.
- Do not modify user config, secrets, credentials, or environment without reason and approval.
- Do not commit build artifacts, secrets, logs, or temporary files that do not belong in the repository.

## 5. Quality Standards

Before submitting work:
- Review the diff of every file.
- Run lint, typecheck, test, and build as defined by the project.
- Check edge cases and error handling.
- Confirm no debug code or placeholders remain.
- Verify that documentation matches the actual implementation.

If any command cannot be run, report the command, the reason, and the impact honestly.

## 6. Reporting

Report concisely with the following headings:
- **What was done:** Changes made.
- **Files changed:** List of files and reasons.
- **Verification results:** Commands run and actual output.
- **Limitations:** Anything not yet completed or not yet tested.
- **Git:** Branch, commit, and push status.

Do not report work as complete if significant tasks remain outstanding.
