# Testing Strategy

## 1. Testing Principles

- Test behavior, not just implementation details.
- Unit tests for Core logic.
- Integration tests for VS Code API and extension lifecycle.
- Test success, failure, and edge cases.
- Do not use mocks alone to claim that a real integration works.

## 2. Unit Tests

Cover:
- Event validation
- Path normalization
- Workspace boundary checks
- Event deduplication
- Session management
- Focus queue / debounce
- Tab safety decisions
- History retention

## 3. Integration Tests

Cover:
- Extension activation/deactivation
- Command registration
- TreeView rendering / provider updates
- Opening a document from a valid pre-edit event
- Filesystem watcher create/change/delete
- Pause / Resume / Auto Focus settings
- Adapter lifecycle and error isolation

## 4. Manual Test Scenarios

1. Edit a file from an Agent inside VS Code.
2. Edit a file from Terminal outside VS Code.
3. Edit a file from PowerShell.
4. Edit a file from WSL in a Workspace opened through VS Code.
5. Two Agent Sessions running simultaneously.
6. The same event sent more than once.
7. A file deleted or moved while waiting to be focused.
8. Auto Focus disabled.
9. Pause triggered while events are incoming.
10. Dirty/pinned/active tabs present while an Agent opens multiple files.

## 5. Detection Accuracy

Test results must be separated by source:
- **Adapter pre-edit:** Prove the event arrived before the edit.
- **Filesystem watcher:** Prove detection happened after a filesystem change.

Never use filesystem watcher results to claim pre-edit detection capability.

## 6. Test Report

Record:
- Environment / OS
- VS Code version
- Agent and version under test
- Steps to reproduce
- Expected result
- Actual result
- PASS / FAIL / NOT RUN
- Sanitized logs
