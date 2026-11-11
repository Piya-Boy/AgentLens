import { describe, expect, it } from "vitest";
import { HOOK_MATCHER, addHook, buildHookCommand, hasHook, removeHook } from "./hook-settings";

const command = buildHookCommand("C:\\Users\\me\\.vscode\\extensions\\agentlens-0.0.1\\dist\\hook.js");

function ours(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { matcher: HOOK_MATCHER, hooks: [{ type: "command", command, timeout: 5 }], ...overrides };
}

const other = { matcher: "Bash", hooks: [{ type: "command", command: "./audit.sh" }] };

function ok(result: ReturnType<typeof addHook>) {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result;
}

describe("buildHookCommand", () => {
  it("quotes the path, uses forward slashes and carries the marker", () => {
    expect(command).toBe('node "C:/Users/me/.vscode/extensions/agentlens-0.0.1/dist/hook.js" --agentlens');
  });
});

describe("addHook", () => {
  it("creates the hook structure in empty settings", () => {
    const result = ok(addHook({}, command));
    expect(result).toEqual({ ok: true, changed: true, settings: { hooks: { PreToolUse: [ours()] } } });
  });

  it("keeps unrelated settings and other hooks", () => {
    const settings = { permissions: { allow: ["Bash(ls)"] }, hooks: { PreToolUse: [other], Stop: [{ hooks: [] }] } };
    const result = ok(addHook(settings, command));
    expect(result.settings).toEqual({
      permissions: { allow: ["Bash(ls)"] },
      hooks: { PreToolUse: [other, ours()], Stop: [{ hooks: [] }] },
    });
  });

  it("is idempotent", () => {
    const first = ok(addHook({}, command));
    const second = ok(addHook(first.settings, command));
    expect(second.changed).toBe(false);
    expect(second.settings).toEqual(first.settings);
  });

  it("refreshes the command when the extension path changed", () => {
    const first = ok(addHook({}, command));
    const moved = buildHookCommand("/new/place/dist/hook.js");
    const second = ok(addHook(first.settings, moved));
    expect(second.changed).toBe(true);
    expect(JSON.stringify(second.settings)).toContain("/new/place/dist/hook.js");
    expect(JSON.stringify(second.settings)).not.toContain("agentlens-0.0.1");
  });

  it("does not remove the user's own handlers that share a group with ours", () => {
    const shared = { matcher: "Edit", hooks: [{ type: "command", command: "./fmt.sh" }, { type: "command", command }] };
    const result = ok(addHook({ hooks: { PreToolUse: [shared] } }, command));
    expect(result.settings).toEqual({
      hooks: {
        PreToolUse: [{ matcher: "Edit", hooks: [{ type: "command", command: "./fmt.sh" }] }, ours()],
      },
    });
  });

  it("does not mutate its input", () => {
    const settings = { hooks: { PreToolUse: [other] } };
    const snapshot = structuredClone(settings);
    addHook(settings, command);
    expect(settings).toEqual(snapshot);
  });

  it.each([
    [[], "settings must be a JSON object"],
    [null, "settings must be a JSON object"],
    [{ hooks: "x" }, "settings.hooks must be an object"],
    [{ hooks: { PreToolUse: {} } }, "settings.hooks.PreToolUse must be an array"],
  ])("rejects unexpected shape %j", (settings, error) => {
    expect(addHook(settings, command)).toEqual({ ok: false, error });
  });
});

describe("removeHook", () => {
  it("removes only the AgentLens hook", () => {
    const settings = { hooks: { PreToolUse: [other, ours()] } };
    expect(ok(removeHook(settings))).toEqual({ ok: true, changed: true, settings: { hooks: { PreToolUse: [other] } } });
  });

  it("drops containers that become empty and keeps other settings", () => {
    const result = ok(removeHook({ model: "opus", hooks: { PreToolUse: [ours()] } }));
    expect(result.settings).toEqual({ model: "opus" });
  });

  it("keeps sibling hook events", () => {
    const result = ok(removeHook({ hooks: { PreToolUse: [ours()], Stop: [other] } }));
    expect(result.settings).toEqual({ hooks: { Stop: [other] } });
  });

  it("reports no change when the hook is absent", () => {
    expect(ok(removeHook({})).changed).toBe(false);
    expect(ok(removeHook({ hooks: { PreToolUse: [other] } })).changed).toBe(false);
  });

  it("keeps the user's handlers that share a group with ours", () => {
    const shared = { matcher: "Edit", hooks: [{ type: "command", command: "./fmt.sh" }, { type: "command", command }] };
    const result = ok(removeHook({ hooks: { PreToolUse: [shared] } }));
    expect(result.settings).toEqual({ hooks: { PreToolUse: [{ matcher: "Edit", hooks: [{ type: "command", command: "./fmt.sh" }] }] } });
  });

  it("rejects unexpected shapes", () => {
    expect(removeHook({ hooks: { PreToolUse: "x" } })).toEqual({
      ok: false,
      error: "settings.hooks.PreToolUse must be an array",
    });
  });
});

describe("hasHook", () => {
  it("is false for empty settings and for settings that cannot hold a hook", () => {
    expect(hasHook({})).toBe(false);
    expect(hasHook({ hooks: {} })).toBe(false);
    expect(hasHook({ hooks: { PreToolUse: "nope" } })).toBe(false);
    expect(hasHook(null)).toBe(false);
    expect(hasHook([])).toBe(false);
  });

  it("is false when only other hooks exist", () => {
    expect(hasHook({ hooks: { PreToolUse: [other] } })).toBe(false);
  });

  it("is true for an entry written by addHook, also next to other hooks", () => {
    const added = ok(addHook({ hooks: { PreToolUse: [other] } }, command));
    expect(hasHook(added.settings)).toBe(true);
  });

  it("is false again after removeHook", () => {
    const added = ok(addHook({}, command));
    const removed = ok(removeHook(added.settings));
    expect(hasHook(removed.settings)).toBe(false);
  });

  it("finds our handler inside a group the user shares with another handler", () => {
    const shared = { matcher: "Edit", hooks: [{ type: "command", command: "./fmt.sh" }, { type: "command", command }] };
    expect(hasHook({ hooks: { PreToolUse: [shared] } })).toBe(true);
  });
});
