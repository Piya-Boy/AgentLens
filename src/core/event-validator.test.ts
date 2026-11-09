import nodePath from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_ID_LENGTH, MAX_PATH_LENGTH, validateAgentFileEvent } from "./event-validator";

const context = { workspaceRoots: ["/ws"], pathApi: nodePath.posix };

function validEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventId: "e1",
    agentId: "claude",
    sessionId: "s1",
    action: "edit",
    status: "started",
    filePath: "/ws/src/a.ts",
    timestamp: 1_700_000_000_000,
    source: "adapter",
    ...overrides,
  };
}

function errorsOf(input: unknown): readonly string[] {
  const result = validateAgentFileEvent(input, context);
  if (result.ok) {
    throw new Error("expected validation to fail");
  }
  return result.errors;
}

describe("validateAgentFileEvent", () => {
  it("accepts a valid adapter event and normalizes the path", () => {
    const result = validateAgentFileEvent(validEvent({ filePath: "/ws/src/../src/a.ts" }), context);
    expect(result).toEqual({ ok: true, event: validEvent({ filePath: "/ws/src/a.ts" }) });
  });

  it("keeps an optional toolName", () => {
    const result = validateAgentFileEvent(validEvent({ toolName: "Edit" }), context);
    expect(result.ok && result.event.toolName).toBe("Edit");
  });

  it("drops unknown fields", () => {
    const result = validateAgentFileEvent(validEvent({ content: "secret", extra: 1 }), context);
    expect(result.ok).toBe(true);
    expect(result.ok && Object.keys(result.event)).not.toContain("content");
  });

  it("accepts a filesystem observation", () => {
    const result = validateAgentFileEvent(validEvent({ source: "filesystem", status: "observed" }), context);
    expect(result.ok).toBe(true);
  });

  it.each([null, undefined, "x", 1, []])("rejects non-object input %j", (input) => {
    expect(errorsOf(input)).toEqual(["event must be an object"]);
  });

  it.each(["eventId", "agentId", "sessionId", "filePath"])("rejects missing %s", (field) => {
    expect(errorsOf(validEvent({ [field]: undefined }))).toContain(`${field} must be a non-empty string`);
  });

  it("rejects oversized identifiers and paths", () => {
    expect(errorsOf(validEvent({ eventId: "x".repeat(MAX_ID_LENGTH + 1) }))).toContain(
      `eventId exceeds ${String(MAX_ID_LENGTH)} characters`,
    );
    expect(errorsOf(validEvent({ filePath: `/ws/${"x".repeat(MAX_PATH_LENGTH)}` }))).toContain(
      `filePath exceeds ${String(MAX_PATH_LENGTH)} characters`,
    );
  });

  it.each([
    ["action", "write"],
    ["status", "running"],
    ["source", "network"],
  ])("rejects invalid %s", (field, value) => {
    expect(errorsOf(validEvent({ [field]: value })).join()).toContain(`${field} must be one of`);
  });

  it.each([0, -1, 1.5, Number.NaN, Infinity, "1700000000000"])("rejects invalid timestamp %j", (timestamp) => {
    expect(errorsOf(validEvent({ timestamp }))).toContain("timestamp must be a positive integer");
  });

  it("rejects a non-string toolName", () => {
    expect(errorsOf(validEvent({ toolName: 5 }))).toContain("toolName must be a non-empty string");
  });

  it("rejects filesystem events that are not observed", () => {
    expect(errorsOf(validEvent({ source: "filesystem", status: "started" }))).toContain(
      "filesystem events must have status observed",
    );
  });

  it("rejects relative paths", () => {
    expect(errorsOf(validEvent({ filePath: "src/a.ts" }))).toContain(
      "filePath must be an absolute path without NUL characters",
    );
  });

  it("rejects paths with NUL characters", () => {
    expect(errorsOf(validEvent({ filePath: "/ws/a\0.ts" }))).toContain(
      "filePath must be an absolute path without NUL characters",
    );
  });

  it.each(["/etc/passwd", "/ws/../etc/passwd", "/ws-other/a.ts", "/ws"])("rejects %s as outside the workspace", (filePath) => {
    expect(errorsOf(validEvent({ filePath }))).toContain("filePath is outside the workspace");
  });

  it("accepts a path inside any of several roots", () => {
    const result = validateAgentFileEvent(validEvent({ filePath: "/other/a.ts" }), {
      workspaceRoots: ["/ws", "/other"],
      pathApi: nodePath.posix,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects everything when no workspace root is open", () => {
    const result = validateAgentFileEvent(validEvent(), { workspaceRoots: [], pathApi: nodePath.posix });
    expect(result.ok).toBe(false);
  });

  it("reports every error at once", () => {
    expect(errorsOf({}).length).toBeGreaterThanOrEqual(7);
  });
});
