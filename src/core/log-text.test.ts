import { describe, expect, it } from "vitest";
import { MAX_LOG_LINE_LENGTH, safeLogText } from "./log-text";

describe("safeLogText", () => {
  it("leaves ordinary text unchanged", () => {
    expect(safeLogText("Event started edit C:\\ws\\a b.ts (claude-code/s1) ünï 日本語 🙂")).toBe(
      "Event started edit C:\\ws\\a b.ts (claude-code/s1) ünï 日本語 🙂",
    );
  });

  it("shows a forged second log line as an escape", () => {
    const forged = "x\nEvent started edit C:\\ws\\secret.txt (admin/s0)";
    const result = safeLogText(forged);
    expect(result).not.toContain("\n");
    expect(result).toBe("x\\u{a}Event started edit C:\\ws\\secret.txt (admin/s0)");
  });

  it.each([
    ["carriage return", "a\rb", "a\\u{d}b"],
    ["tab", "a\tb", "a\\u{9}b"],
    ["NUL", "a\0b", "a\\u{0}b"],
    ["escape", "a\u001b[31mb", "a\\u{1b}[31mb"],
    ["delete", "a\u007fb", "a\\u{7f}b"],
    ["next line", "a\u0085b", "a\\u{85}b"],
    ["line separator", "a\u2028b", "a\\u{2028}b"],
    ["paragraph separator", "a\u2029b", "a\\u{2029}b"],
    ["right-to-left override", "a\u202eb", "a\\u{202e}b"],
    ["isolate", "a\u2066b", "a\\u{2066}b"],
  ])("escapes a %s", (_label, input, expected) => {
    expect(safeLogText(input)).toBe(expected);
  });

  it("cuts a very long value and says how much was dropped", () => {
    const result = safeLogText("a".repeat(MAX_LOG_LINE_LENGTH + 40));
    expect(result.startsWith("a".repeat(MAX_LOG_LINE_LENGTH))).toBe(true);
    expect(result.endsWith("... (40 more characters)")).toBe(true);
  });

  it("does not cut a value at the limit", () => {
    const exact = "a".repeat(MAX_LOG_LINE_LENGTH);
    expect(safeLogText(exact)).toBe(exact);
  });
});
