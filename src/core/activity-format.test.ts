import nodePath from "node:path";
import { describe, expect, it } from "vitest";
import type { AgentFileEvent } from "../models/agent-file-event";
import { describeEvent, describeSession, describeStatus } from "./activity-format";
import type { SessionInfo } from "./session-manager";

const formatTime = (timestamp: number): string => `t${String(timestamp)}`;

function event(overrides: Partial<AgentFileEvent> = {}): AgentFileEvent {
  return {
    eventId: "e1",
    agentId: "claude-code",
    sessionId: "s1",
    action: "edit",
    status: "started",
    filePath: nodePath.join("ws", "src", "a.ts"),
    timestamp: 42,
    source: "adapter",
    ...overrides,
  };
}

describe("describeEvent", () => {
  it("labels a pre-edit adapter event with its status", () => {
    const description = describeEvent(event(), formatTime);
    expect(description.label).toBe("started edit a.ts");
    expect(description.description).toBe("claude-code/s1 · t42");
  });

  it("labels a filesystem event as observed so it is never mistaken for pre-edit", () => {
    const description = describeEvent(event({ source: "filesystem", status: "observed" }), formatTime);
    expect(description.label).toBe("observed edit a.ts");
  });

  it("lists every field in the tooltip, including the tool when present", () => {
    const tooltip = describeEvent(event({ toolName: "Edit" }), formatTime).tooltip;
    expect(tooltip).toContain(nodePath.join("ws", "src", "a.ts"));
    for (const line of ["Source: adapter", "Status: started", "Action: edit", "Agent: claude-code", "Session: s1", "Tool: Edit", "Time: t42"]) {
      expect(tooltip).toContain(line);
    }
  });

  it("omits the tool line when there is no tool", () => {
    expect(describeEvent(event(), formatTime).tooltip).not.toContain("Tool:");
  });
});

describe("describeSession", () => {
  const session: SessionInfo = {
    agentId: "claude-code",
    sessionId: "s1",
    firstSeen: 1,
    lastSeen: 99,
    eventCount: 3,
    lastFilePath: "/ws/a.ts",
    lastAction: "edit",
    lastStatus: "started",
  };

  it("summarizes the session", () => {
    expect(describeSession(session, formatTime)).toEqual({
      label: "claude-code / s1",
      description: "3 events · t99",
      tooltip: "Last: started edit /ws/a.ts",
    });
  });

  it("uses the singular for one event", () => {
    expect(describeSession({ ...session, eventCount: 1 }, formatTime).description).toBe("1 event · t99");
  });
});

describe("describeStatus", () => {
  it("shows off when disabled, even if paused", () => {
    expect(describeStatus(false, true).text).toContain("off");
  });

  it("shows paused when enabled and paused", () => {
    expect(describeStatus(true, true).text).toContain("paused");
  });

  it("shows the plain name when active", () => {
    expect(describeStatus(true, false).text).toBe("$(eye) AgentLens");
  });
});
