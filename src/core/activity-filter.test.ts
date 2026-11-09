import { describe, expect, it, vi } from "vitest";
import type { AgentFileEvent } from "../models/agent-file-event";
import {
  ActivityFilterState,
  describeFilter,
  distinctValues,
  filterActivity,
  isFilterActive,
  parseFilterArgs,
} from "./activity-filter";

function event(overrides: Partial<AgentFileEvent> = {}): AgentFileEvent {
  return {
    eventId: "e1",
    agentId: "claude-code",
    sessionId: "s1",
    action: "edit",
    status: "started",
    filePath: "/ws/a.ts",
    timestamp: 1000,
    source: "adapter",
    ...overrides,
  };
}

const events = [
  event({ eventId: "1" }),
  event({ eventId: "2", agentId: "unknown", sessionId: "filesystem", action: "create" }),
  event({ eventId: "3", sessionId: "s2", action: "read" }),
];
const ids = (list: readonly AgentFileEvent[]): string[] => list.map((entry) => entry.eventId);

describe("filterActivity", () => {
  it("returns everything for an empty filter", () => {
    expect(ids(filterActivity(events, {}))).toEqual(["1", "2", "3"]);
  });

  it("filters by agent, session and action", () => {
    expect(ids(filterActivity(events, { agentId: "unknown" }))).toEqual(["2"]);
    expect(ids(filterActivity(events, { sessionId: "s2" }))).toEqual(["3"]);
    expect(ids(filterActivity(events, { action: "edit" }))).toEqual(["1"]);
  });

  it("combines criteria with AND", () => {
    expect(ids(filterActivity(events, { agentId: "claude-code", action: "read" }))).toEqual(["3"]);
    expect(filterActivity(events, { agentId: "unknown", action: "edit" })).toEqual([]);
  });
});

describe("isFilterActive and describeFilter", () => {
  it("detects an empty filter", () => {
    expect(isFilterActive({})).toBe(false);
    expect(isFilterActive({ action: "edit" })).toBe(true);
  });

  it("describes the active criteria", () => {
    expect(describeFilter({ agentId: "a", sessionId: "s", action: "edit" })).toBe("agent=a, session=s, action=edit");
    expect(describeFilter({})).toBe("");
  });
});

describe("distinctValues", () => {
  it("lists sorted unique values", () => {
    expect(distinctValues(events, "agentId")).toEqual(["claude-code", "unknown"]);
    expect(distinctValues(events, "sessionId")).toEqual(["filesystem", "s1", "s2"]);
    expect(distinctValues(events, "action")).toEqual(["create", "edit", "read"]);
  });
});

describe("parseFilterArgs", () => {
  it("accepts valid criteria and drops unknown keys", () => {
    expect(parseFilterArgs({ agentId: "a", action: "edit", extra: 1 })).toEqual({ agentId: "a", action: "edit" });
  });

  it("treats an empty object as no filter", () => {
    expect(parseFilterArgs({})).toEqual({});
  });

  it.each([null, undefined, "x", 1, []])("rejects non-object input %j", (input) => {
    expect(parseFilterArgs(input)).toBeUndefined();
  });

  it.each([{ agentId: 5 }, { sessionId: "" }, { action: "write" }, { action: 1 }])(
    "rejects invalid criteria %j",
    (input) => {
      expect(parseFilterArgs(input)).toBeUndefined();
    },
  );
});

describe("ActivityFilterState", () => {
  it("starts empty and stores the filter", () => {
    const state = new ActivityFilterState();
    expect(state.filter).toEqual({});
    state.set({ agentId: "a" });
    expect(state.filter).toEqual({ agentId: "a" });
  });

  it("notifies on set and on clear, but not when clearing an empty filter", () => {
    const state = new ActivityFilterState();
    const listener = vi.fn();
    state.onDidChange(listener);

    state.clear();
    expect(listener).not.toHaveBeenCalled();

    state.set({ action: "edit" });
    state.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith({});
  });

  it("stops notifying after dispose", () => {
    const state = new ActivityFilterState();
    const listener = vi.fn();
    state.onDidChange(listener).dispose();
    state.set({ agentId: "a" });
    expect(listener).not.toHaveBeenCalled();
  });
});
