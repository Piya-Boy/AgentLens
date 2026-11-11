import { describe, expect, it, vi } from "vitest";
import type { AgentFileEvent } from "../models/agent-file-event";
import { ActivityStore } from "./activity-store";

function event(eventId: string): AgentFileEvent {
  return {
    eventId,
    agentId: "claude",
    sessionId: "s1",
    action: "edit",
    status: "started",
    filePath: "/ws/a.ts",
    timestamp: 1000,
    source: "adapter",
  };
}

const ids = (store: ActivityStore): string[] => store.list().map((entry) => entry.eventId);

describe("ActivityStore", () => {
  it("lists events newest first", () => {
    const store = new ActivityStore();
    store.add(event("a"));
    store.add(event("b"));
    store.add(event("c"));
    expect(ids(store)).toEqual(["c", "b", "a"]);
  });

  it("drops the oldest events beyond the limit", () => {
    const store = new ActivityStore({ maxEntries: 2 });
    store.add(event("a"));
    store.add(event("b"));
    store.add(event("c"));
    expect(ids(store)).toEqual(["c", "b"]);
  });

  it("returns a copy that callers cannot use to mutate the store", () => {
    const store = new ActivityStore();
    store.add(event("a"));
    (store.list() as AgentFileEvent[]).pop();
    expect(ids(store)).toEqual(["a"]);
  });

  it("clears history", () => {
    const store = new ActivityStore();
    store.add(event("a"));
    store.clear();
    expect(store.list()).toEqual([]);
  });

  it("notifies on add and clear, but not when clearing an empty store", () => {
    const store = new ActivityStore();
    const listener = vi.fn();
    store.onDidChange(listener);

    store.clear();
    expect(listener).not.toHaveBeenCalled();

    store.add(event("a"));
    store.clear();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("stops notifying after dispose", () => {
    const store = new ActivityStore();
    const listener = vi.fn();
    store.onDidChange(listener).dispose();
    store.add(event("a"));
    expect(listener).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects invalid maxEntries %j", (maxEntries) => {
    expect(() => new ActivityStore({ maxEntries })).toThrow(RangeError);
  });
});
