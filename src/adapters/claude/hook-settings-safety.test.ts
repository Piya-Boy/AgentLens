import { describe, expect, it } from "vitest";
import { addHook, buildHookCommand, isShellSafePath, removeHook } from "./hook-settings";

describe("isShellSafePath", () => {
  it.each([
    ["a posix path", "/home/me/.vscode/extensions/agentlens-0.0.1/dist/hook.js"],
    ["a windows path", "C:\\Users\\me\\.vscode\\extensions\\agentlens-0.0.1\\dist\\hook.js"],
    ["a path with spaces", "/home/my user/ext/dist/hook.js"],
    ["a path with single quotes", "/home/o'brien/ext/dist/hook.js"],
  ])("accepts %s", (_label, hookScriptPath) => {
    expect(isShellSafePath(hookScriptPath)).toBe(true);
  });

  it.each([
    ["a double quote", '/home/a"b/dist/hook.js'],
    ["a command substitution", "/home/$(id)/dist/hook.js"],
    ["a variable", "/home/$HOME/dist/hook.js"],
    ["a backtick", "/home/`id`/dist/hook.js"],
    ["a windows variable", "C:\\%USERPROFILE%\\dist\\hook.js"],
    ["an exclamation mark", "/home/a!b/dist/hook.js"],
    ["a newline", "/home/a\nb/dist/hook.js"],
    ["a carriage return", "/home/a\rb/dist/hook.js"],
    ["a NUL character", "/home/a\0b/dist/hook.js"],
  ])("rejects %s", (_label, hookScriptPath) => {
    expect(isShellSafePath(hookScriptPath)).toBe(false);
  });
});

describe("removeHook matching", () => {
  const ours = buildHookCommand("/ext/dist/hook.js");

  function settingsWith(...commands: string[]): Record<string, unknown> {
    return {
      hooks: {
        PreToolUse: [{ matcher: "Edit", hooks: commands.map((command) => ({ type: "command", command })) }],
      },
    };
  }

  it("keeps a user hook whose command only mentions the marker", () => {
    const result = removeHook(settingsWith(ours, "mytool --agentlens-off", "echo --agentlens now"));

    expect(result).toMatchObject({ ok: true, changed: true });
    expect(JSON.stringify(result.ok ? result.settings : {})).toContain("mytool --agentlens-off");
    expect(JSON.stringify(result.ok ? result.settings : {})).toContain("echo --agentlens now");
    expect(JSON.stringify(result.ok ? result.settings : {})).not.toContain("hook.js");
  });

  it("does not touch a user hook when adding", () => {
    const result = addHook(settingsWith("mytool --agentlens-off"), ours);

    expect(JSON.stringify(result.ok ? result.settings : {})).toContain("mytool --agentlens-off");
  });
});
