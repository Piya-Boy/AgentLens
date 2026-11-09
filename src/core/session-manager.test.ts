import { describe, expect, it, vi } from "vitest";
import type { AgentFileEvent } from "../models/agent-file-event";
import { SessionManager } from "./session-manager";

function event(overrides: Partial<AgentFileEvent> = {}): AgentFileEvent {
  return {
    eventId: "e1",
    agentId: "claude",
    sessionId: "s1",
    action: "edit",
    status: "started",
    filePath: "/ws/a.ts",
    timestamp: 1000,
    source: "adapter",
    ...overrides,
  };
}

describe("SessionManager", () => {
  it("creates a session from the first event", () => {
    const manager = new SessionManager();
    expect(manager.record(event())).toEqual({
      agentId: "claude",
      sessionId: "s1",
      firstSeen: 1000,
      lastSeen: 1000,
      eventCount: 1,
      lastFilePath: "/ws/a.ts",
      lastAction: "edit",
      lastStatus: "started",
    });
  });

  it("updates an existing session with newer events", () => {
    const manager = new SessionManager();
    manager.record(event());
    const updated = manager.record(
      event({ eventId: "e2", timestamp: 2000, filePath: "/ws/b.ts", action: "create", status: "completed" }),
    );
    expect(updated).toMatchObject({
      firstSeen: 1000,
      lastSeen: 2000,
      eventCount: 2,
      lastFilePath: "/ws/b.ts",
      lastAction: "create",
      lastStatus: "completed",
    });
  });

  it("keeps the latest file when an older event arrives late", () => {
    const manager = new SessionManager();
    manager.record(event({ timestamp: 2000, filePath: "/ws/new.ts" }));
    const updated = manager.record(event({ eventId: "e2", timestamp: 500, filePath: "/ws/old.ts" }));
    expect(updated).toMatchObject({
      firstSeen: 500,
      lastSeen: 2000,
      eventCount: 2,
      lastFilePath: "/ws/new.ts",
    });
  });

  it("separates sessions by agent and session id", () => {
    const manager = new SessionManager();
    manager.record(event());
    manager.record(event({ agentId: "codex" }));
    manager.record(event({ sessionId: "s2" }));
    expect(manager.list()).toHaveLength(3);
  });

  it("does not collide on ids containing separators", () => {
    const manager = new SessionManager();
    manager.record(event({ agentId: "a:b", sessionId: "c" }));
    manager.record(event({ agentId: "a", sessionId: "b:c" }));
    expect(manager.list()).toHaveLength(2);
  });

  it("looks up a session by ids", () => {
    const manager = new SessionManager();
    manager.record(event());
    expect(manager.get("claude", "s1")?.eventCount).toBe(1);
    expect(manager.get("claude", "missing")).toBeUndefined();
  });

  it("lists sessions most recent first", () => {
    const manager = new SessionManager();
    manager.record(event({ sessionId: "old", timestamp: 1000 }));
    manager.record(event({ sessionId: "new", timestamp: 3000 }));
    manager.record(event({ sessionId: "mid", timestamp: 2000 }));
    expect(manager.list().map((session) => session.sessionId)).toEqual(["new", "mid", "old"]);
  });

  it("evicts the least recently updated session beyond the limit", () => {
    const manager = new SessionManager({ maxSessions: 2 });
    manager.record(event({ sessionId: "a" }));
    manager.record(event({ sessionId: "b" }));
    manager.record(event({ sessionId: "a", eventId: "e2" }));
    manager.record(event({ sessionId: "c" }));
    expect(manager.get("claude", "b")).toBeUndefined();
    expect(manager.get("claude", "a")).toBeDefined();
    expect(manager.get("claude", "c")).toBeDefined();
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects invalid maxSessions %j", (maxSessions) => {
    expect(() => new SessionManager({ maxSessions })).toThrow(RangeError);
  });

  it("notifies listeners on every change until disposed", () => {
    const manager = new SessionManager();
    const listener = vi.fn();
    const subscription = manager.onDidChange(listener);

    manager.record(event());
    expect(listener).toHaveBeenCalledOnce();

    subscription.dispose();
    manager.record(event({ eventId: "e2" }));
    expect(listener).toHaveBeenCalledOnce();
  });
});
