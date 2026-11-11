import nodePath from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseClaudePreToolUse } from "../adapters/claude/pre-tool-use";
import { createFilesystemEvent } from "../detectors/filesystem-event";
import type { AgentFileEvent } from "../models/agent-file-event";
import { ActivityStore } from "./activity-store";
import { EventManager } from "./event-manager";
import { SessionManager } from "./session-manager";

function createPipeline() {
  const sessions = new SessionManager();
  const activity = new ActivityStore();
  const reportListenerError = vi.fn();
  const manager = new EventManager({
    getWorkspaceRoots: () => ["/ws"],
    reportListenerError,
    pathApi: nodePath.posix,
  });
  manager.onEvent((event) => {
    sessions.record(event);
    activity.add(event);
  });
  return { manager, sessions, activity, reportListenerError };
}

function claudePayload(sessionId: string, toolUseId: string, filePath: string): Record<string, unknown> {
  return {
    hook_event_name: "PreToolUse",
    session_id: sessionId,
    tool_use_id: toolUseId,
    tool_name: "Edit",
    tool_input: { file_path: filePath, old_string: "a", new_string: "b" },
  };
}

function fromClaude(sessionId: string, toolUseId: string, filePath: string, now: number): AgentFileEvent {
  const parsed = parseClaudePreToolUse(claudePayload(sessionId, toolUseId, filePath), now);
  if (!parsed.ok) {
    throw new Error(parsed.detail);
  }
  return parsed.event;
}

describe("event pipeline with several agents and sessions", () => {
  it("keeps interleaved sessions of different agents separate", () => {
    const { manager, sessions } = createPipeline();

    manager.ingest(fromClaude("s1", "t1", "/ws/a.ts", 1000));
    manager.ingest({ ...fromClaude("s1", "t1", "/ws/x.ts", 1100), agentId: "other-agent" });
    manager.ingest(fromClaude("s2", "t2", "/ws/b.ts", 1200));
    manager.ingest(fromClaude("s1", "t3", "/ws/c.ts", 5000));

    expect(sessions.get("claude-code", "s1")).toMatchObject({ eventCount: 2, lastFilePath: "/ws/c.ts" });
    expect(sessions.get("claude-code", "s2")).toMatchObject({ eventCount: 1, lastFilePath: "/ws/b.ts" });
    expect(sessions.get("other-agent", "s1")).toMatchObject({ eventCount: 1, lastFilePath: "/ws/x.ts" });
  });

  it("accepts the same event id from different agents and sessions", () => {
    const { manager, activity } = createPipeline();

    const results = [
      manager.ingest(fromClaude("s1", "same-id", "/ws/a.ts", 1000)),
      manager.ingest(fromClaude("s2", "same-id", "/ws/a.ts", 1000)),
      manager.ingest({ ...fromClaude("s1", "same-id", "/ws/a.ts", 1000), agentId: "other-agent" }),
    ];

    expect(results.map((result) => result.accepted)).toEqual([true, true, true]);
    expect(activity.list()).toHaveLength(3);
  });

  it("drops a retransmitted hook call but keeps the session count correct", () => {
    const { manager, sessions, activity } = createPipeline();

    expect(manager.ingest(fromClaude("s1", "t1", "/ws/a.ts", 1000)).accepted).toBe(true);
    expect(manager.ingest(fromClaude("s1", "t1", "/ws/a.ts", 9000))).toEqual({ accepted: false, reason: "duplicate" });

    expect(sessions.get("claude-code", "s1")?.eventCount).toBe(1);
    expect(activity.list()).toHaveLength(1);
  });

  it("records filesystem observations in their own session next to adapter sessions", () => {
    const { manager, sessions, activity } = createPipeline();

    manager.ingest(fromClaude("s1", "t1", "/ws/a.ts", 1000));
    manager.ingest(createFilesystemEvent("change", "/ws/a.ts", 1100, "fs-1"));

    expect(sessions.list()).toHaveLength(2);
    expect(sessions.get("unknown", "filesystem")).toMatchObject({ lastStatus: "observed", lastAction: "edit" });
    expect(sessions.get("claude-code", "s1")).toMatchObject({ lastStatus: "started" });
    expect(activity.list().map((event) => event.source)).toEqual(["filesystem", "adapter"]);
  });

  it("rejects out-of-workspace events from one agent without affecting the others", () => {
    const { manager, sessions } = createPipeline();

    manager.ingest(fromClaude("s1", "t1", "/ws/a.ts", 1000));
    const rejected = manager.ingest(fromClaude("s2", "t2", "/etc/passwd", 1100));
    manager.ingest(fromClaude("s1", "t3", "/ws/b.ts", 5000));

    expect(rejected).toMatchObject({ accepted: false, reason: "invalid" });
    expect(sessions.get("claude-code", "s2")).toBeUndefined();
    expect(sessions.get("claude-code", "s1")?.eventCount).toBe(2);
  });

  it("keeps working for other listeners when one subscriber throws", () => {
    const { manager, sessions, reportListenerError } = createPipeline();
    manager.onEvent(() => {
      throw new Error("ui crashed");
    });

    manager.ingest(fromClaude("s1", "t1", "/ws/a.ts", 1000));
    manager.ingest(fromClaude("s1", "t2", "/ws/b.ts", 5000));

    expect(reportListenerError).toHaveBeenCalledTimes(2);
    expect(sessions.get("claude-code", "s1")?.eventCount).toBe(2);
  });
});
