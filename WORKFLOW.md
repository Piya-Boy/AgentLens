# Development Workflow

This document defines how the project owner and AI Coding Agents work together.

## 1. Working Model

- **Product Owner:** The project owner defines goals and makes decisions.
- **AI Lead/PM:** Helps analyze, break down work, plan, and verify completeness.
- **AI Developer:** Implements code, runs tests, and reports results.

One AI may play multiple roles, but each step must be clearly separated.

## 2. Per-task Workflow

### Step 1 — Understand
- Read relevant documents.
- Review the code and Git status.
- Summarize the problem and desired outcome.
- If information is insufficient, ask only the necessary questions.

### Step 2 — Plan
Before writing any code, state:
- The goal.
- What is in scope and what is not.
- Files to be created or modified.
- Implementation steps.
- Risks and how to test.

Small, well-defined tasks may use a brief plan — do not over-document.

### Step 3 — Implement
- Follow the agreed plan.
- Stay within scope.
- Break work into small units.
- Do not change architecture without notifying the owner.
- If a problem invalidates the original plan, stop the affected part and explain before changing direction.

### Step 4 — Verify
Run the relevant commands, such as:
- lint
- typecheck
- unit tests
- integration tests
- build

Check actual results. Never guess at output or report passing without running commands.

### Step 5 — Review
- Check `git diff`.
- Check for side effects.
- Check error handling.
- Check security/privacy.
- Check docs and config.

### Step 6 — Commit and Report
Once the feature has passed review, commit separately as described in `GIT.md`.
Push only to the correct branch and only when permitted/agreed by the workflow.

## 3. One Feature = One Commit + Push

- One clearly scoped feature or bugfix per commit.
- Do not mix unrelated work in a single commit.
- For large tasks, break into multiple meaningful commits.
- Review the staged diff before committing.
- Do not use destructive Git commands to fix problems without permission.
- Do not push work that has not passed review.

## 4. Communication Style

- Be direct and natural; avoid exaggerated claims.
- Explain technical terms when necessary.
- Do not dump long logs without a summary.
- Report blockers immediately.
- Clearly separate facts, assumptions, and proposals.

## 5. When to Ask

Ask the project owner when:
- Scope or UX needs to change in a significant way.
- There are multiple options with very different trade-offs.
- An external service must be added or data must leave the device.
- Data must be deleted or a hard-to-reverse command must be used.
- Requirements conflict with each other.

Do not ask about minor implementation details that have a safe, architecture-consistent path forward.

## 6. Final Report Template

```text
Summary
- ...

Files Changed
- ...

Verification
- lint: PASS/FAIL/NOT RUN
- typecheck: PASS/FAIL/NOT RUN
- tests: PASS/FAIL/NOT RUN
- build: PASS/FAIL/NOT RUN

Limitations / Outstanding Work
- ...

Git
- Branch:
- Commit:
- Push:
```
