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

**Status:** Proposed

**Decision:** Target a default of 5 open tabs, but do not force-close tabs when it is not safe to do so.

**Reason:** Prevents loss of unsaved work and avoids disrupting the user.

**Open question:** VS Code API constraints and the actual method for closing editors automatically must be verified before implementation.
