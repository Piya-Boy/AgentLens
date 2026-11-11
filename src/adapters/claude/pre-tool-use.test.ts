import nodePath from "node:path";
import { describe, expect, it } from "vitest";
import { validateAgentFileEvent } from "../../core/event-validator";
import { parseClaudePreToolUse } from "./pre-tool-use";

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    session_id: "abc123",
    prompt_id: "550e8400-e29b-41d4-a716-446655440000",
    transcript_path: "/home/user/.claude/projects/p/transcript.jsonl",
    cwd: "/home/user/my-project",
    permission_mode: "default",
    hook_event_name: "PreToolUse",
    tool_name: "Edit",
    tool_input: {
      file_path: "/home/user/my-project/src/a.ts",
      old_string: "secret old",
      new_string: "secret new",
      replace_all: false,
    },
    tool_use_id: "toolu_01ABC123",
    ...overrides,
  };
}

function failureOf(input: unknown) {
  const result = parseClaudePreToolUse(input, 1000);
  if (result.ok) {
    throw new Error("expected parsing to fail");
  }
  return result;
}

describe("parseClaudePreToolUse", () => {
  it("maps an Edit payload to a pre-edit adapter event", () => {
    expect(parseClaudePreToolUse(payload(), 1234)).toEqual({
      ok: true,
      event: {
        eventId: "toolu_01ABC123",
        agentId: "claude-code",
        sessionId: "abc123",
        action: "edit",
        status: "started",
        filePath: "/home/user/my-project/src/a.ts",
        timestamp: 1234,
        toolName: "Edit",
        source: "adapter",
      },
    });
  });

  it("reports Write as an edit because overwrite cannot be told from create beforehand", () => {
    const result = parseClaudePreToolUse(
      payload({ tool_name: "Write", tool_input: { file_path: "/home/user/my-project/new.ts", content: "x" } }),
      1000,
    );
    expect(result.ok && result.event.action).toBe("edit");
    expect(result.ok && result.event.toolName).toBe("Write");
  });

  it("maps Read to a read action", () => {
    const result = parseClaudePreToolUse(
      payload({ tool_name: "Read", tool_input: { file_path: "/home/user/my-project/a.ts" } }),
      1000,
    );
    expect(result.ok && result.event.action).toBe("read");
  });

  it("never copies file content from the payload", () => {
    const result = parseClaudePreToolUse(payload(), 1000);
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("keeps Windows backslash paths so the validator can normalize them", () => {
    const result = parseClaudePreToolUse(
      payload({ tool_input: { file_path: "C:\\Users\\me\\proj\\src\\a.ts" } }),
      1000,
    );
    expect(result.ok && result.event.filePath).toBe("C:\\Users\\me\\proj\\src\\a.ts");
    const validated = validateAgentFileEvent(result.ok ? result.event : undefined, {
      workspaceRoots: ["C:\\Users\\me\\proj"],
      pathApi: nodePath.win32,
    });
    expect(validated.ok).toBe(true);
  });

  it.each(["PostToolUse", "SessionStart", undefined])("treats hook_event_name %s as unsupported", (name) => {
    expect(failureOf(payload({ hook_event_name: name })).reason).toBe("unsupported");
  });

  it.each(["Bash", "MultiEdit", "NotebookEdit", "Glob", "toString", "__proto__"])(
    "treats tool %s as unsupported",
    (toolName) => {
      expect(failureOf(payload({ tool_name: toolName })).reason).toBe("unsupported");
    },
  );

  it.each([null, undefined, "x", 1, []])("rejects non-object payload %j", (input) => {
    expect(failureOf(input).reason).toBe("malformed");
  });

  it.each([
    ["tool_name", { tool_name: 5 }],
    ["session_id", { session_id: "" }],
    ["tool_use_id", { tool_use_id: undefined }],
    ["tool_input", { tool_input: "nope" }],
    ["tool_input.file_path", { tool_input: { file_path: 5 } }],
    ["tool_input.file_path", { tool_input: {} }],
  ])("rejects a missing or invalid %s", (field, change) => {
    const result = failureOf(payload(change));
    expect(result.reason).toBe("malformed");
    expect(result.detail).toContain(field);
  });
});
