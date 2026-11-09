import { describe, expect, it } from "vitest";
import { MAX_FORWARD_BYTES, buildForwardMessage } from "./forward-message";

function payload(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    session_id: "abc123",
    transcript_path: "/home/me/.claude/projects/p/t.jsonl",
    cwd: "/home/me/proj",
    permission_mode: "default",
    hook_event_name: "PreToolUse",
    tool_name: "Write",
    tool_input: { file_path: "/home/me/proj/a.ts", content: "TOP SECRET SOURCE" },
    tool_use_id: "toolu_01",
    ...overrides,
  });
}

describe("buildForwardMessage", () => {
  it("keeps only the fields AgentLens needs", () => {
    expect(buildForwardMessage(payload())).toEqual({
      hook_event_name: "PreToolUse",
      session_id: "abc123",
      tool_use_id: "toolu_01",
      tool_name: "Write",
      cwd: "/home/me/proj",
      tool_input: { file_path: "/home/me/proj/a.ts" },
    });
  });

  it("never forwards file contents or the transcript path", () => {
    const serialized = JSON.stringify(
      buildForwardMessage(
        payload({ tool_input: { file_path: "/p/a.ts", old_string: "SECRET OLD", new_string: "SECRET NEW" } }),
      ),
    );
    expect(serialized).not.toContain("SECRET");
    expect(serialized).not.toContain("transcript");
  });

  it("returns undefined for invalid JSON", () => {
    expect(buildForwardMessage("not json")).toBeUndefined();
    expect(buildForwardMessage("")).toBeUndefined();
  });

  it.each([null, [], "x", 5])("returns undefined for non-object JSON %j", (value) => {
    expect(buildForwardMessage(JSON.stringify(value))).toBeUndefined();
  });

  it.each([
    { session_id: 1 },
    { tool_use_id: undefined },
    { tool_name: undefined },
    { cwd: undefined },
    { hook_event_name: undefined },
    { tool_input: undefined },
    { tool_input: { file_path: 5 } },
    { tool_input: {} },
  ])("returns undefined when a required field is missing or wrong: %j", (change) => {
    expect(buildForwardMessage(payload(change))).toBeUndefined();
  });

  it("returns undefined when the reduced message is too large", () => {
    expect(buildForwardMessage(payload({ session_id: "x".repeat(MAX_FORWARD_BYTES) }))).toBeUndefined();
  });
});
