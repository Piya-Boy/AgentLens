import nodePath from "node:path";
import { describe, expect, it } from "vitest";
import { validateAgentFileEvent } from "./event-validator";
import { createMockEvent } from "./mock-event";

describe("createMockEvent", () => {
  it("builds a pre-edit adapter event for the given file", () => {
    expect(createMockEvent("/ws/a.ts", 1234, "id-1")).toEqual({
      eventId: "id-1",
      agentId: "mock",
      sessionId: "mock-session",
      action: "edit",
      status: "started",
      filePath: "/ws/a.ts",
      timestamp: 1234,
      toolName: "mock",
      source: "adapter",
    });
  });

  it("passes validation for a file inside the workspace", () => {
    const result = validateAgentFileEvent(createMockEvent("/ws/a.ts", 1234, "id-1"), {
      workspaceRoots: ["/ws"],
      pathApi: nodePath.posix,
    });
    expect(result.ok).toBe(true);
  });
});
