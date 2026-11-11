import { describe, expect, it } from "vitest";
import type { AgentFileEvent } from "../models/agent-file-event";
import { EventDeduplicator } from "./event-deduplicator";

function event(overrides: Partial<AgentFileEvent> = {}): AgentFileEvent {
  return {
    eventId: "e1",
    agentId: "claude",
    sessionId: "s1",
    action: "edit",
    status: "started",
    filePath: "/ws/a.ts",
    timestamp: 10_000,
    source: "adapter",
    ...overrides,
  };
}

describe("EventDeduplicator", () => {
  it("accepts the first event", () => {
    expect(new EventDeduplicator().isDuplicate(event())).toBe(false);
  });

  it("flags a retransmission with the same event id even much later", () => {
    const dedup = new EventDeduplicator();
    dedup.isDuplicate(event());
    expect(dedup.isDuplicate(event({ timestamp: 99_000, filePath: "/ws/other.ts" }))).toBe(true);
  });

  it("scopes event ids per agent and session", () => {
    const dedup = new EventDeduplicator();
    dedup.isDuplicate(event());
    expect(dedup.isDuplicate(event({ agentId: "codex", timestamp: 20_000 }))).toBe(false);
    expect(dedup.isDuplicate(event({ sessionId: "s2", timestamp: 30_000 }))).toBe(false);
  });

  it("flags identical content with a new id inside the window", () => {
    const dedup = new EventDeduplicator({ windowMs: 500 });
    dedup.isDuplicate(event());
    expect(dedup.isDuplicate(event({ eventId: "e2", timestamp: 10_400 }))).toBe(true);
  });

  it("accepts identical content outside the window", () => {
    const dedup = new EventDeduplicator({ windowMs: 500 });
    dedup.isDuplicate(event());
    expect(dedup.isDuplicate(event({ eventId: "e2", timestamp: 10_501 }))).toBe(false);
  });

  it("anchors the window at the first accepted event", () => {
    const dedup = new EventDeduplicator({ windowMs: 500 });
    expect(dedup.isDuplicate(event({ eventId: "e1", timestamp: 10_000 }))).toBe(false);
    expect(dedup.isDuplicate(event({ eventId: "e2", timestamp: 10_400 }))).toBe(true);
    expect(dedup.isDuplicate(event({ eventId: "e3", timestamp: 10_800 }))).toBe(false);
  });

  it.each([
    ["action", { action: "create" as const }],
    ["status", { status: "completed" as const }],
    ["filePath", { filePath: "/ws/b.ts" }],
    ["source", { source: "filesystem" as const, status: "observed" as const }],
  ])("treats a different %s as a new event", (_field, change) => {
    const dedup = new EventDeduplicator();
    dedup.isDuplicate(event());
    expect(dedup.isDuplicate(event({ eventId: "e2", timestamp: 10_100, ...change }))).toBe(false);
  });

  it("only collapses equal timestamps when the window is zero", () => {
    const dedup = new EventDeduplicator({ windowMs: 0 });
    dedup.isDuplicate(event());
    expect(dedup.isDuplicate(event({ eventId: "e2" }))).toBe(true);
    expect(dedup.isDuplicate(event({ eventId: "e3", timestamp: 10_001 }))).toBe(false);
  });

  it("forgets the oldest entries beyond maxEntries", () => {
    const dedup = new EventDeduplicator({ maxEntries: 2 });
    dedup.isDuplicate(event({ eventId: "a", filePath: "/ws/a.ts" }));
    dedup.isDuplicate(event({ eventId: "b", filePath: "/ws/b.ts" }));
    dedup.isDuplicate(event({ eventId: "c", filePath: "/ws/c.ts" }));
    expect(dedup.isDuplicate(event({ eventId: "a", filePath: "/ws/a.ts" }))).toBe(false);
    expect(dedup.isDuplicate(event({ eventId: "c", filePath: "/ws/c.ts" }))).toBe(true);
  });

  it.each([-1, 1.5, Number.NaN])("rejects invalid windowMs %j", (windowMs) => {
    expect(() => new EventDeduplicator({ windowMs })).toThrow(RangeError);
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects invalid maxEntries %j", (maxEntries) => {
    expect(() => new EventDeduplicator({ maxEntries })).toThrow(RangeError);
  });
});
