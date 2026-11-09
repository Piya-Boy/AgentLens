import nodePath from "node:path";
import { describe, expect, it } from "vitest";
import { isStrictlyInside, normalizeAbsolutePath } from "./path-utils";

describe("normalizeAbsolutePath", () => {
  it("collapses dot segments and trailing separators (posix)", () => {
    expect(normalizeAbsolutePath("/ws/src/../src/./a.ts/", nodePath.posix)).toBe("/ws/src/a.ts");
  });

  it("collapses dot segments and normalizes separators (win32)", () => {
    expect(normalizeAbsolutePath("C:/ws/src/../src/a.ts", nodePath.win32)).toBe("C:\\ws\\src\\a.ts");
  });

  it("keeps a bare root", () => {
    expect(normalizeAbsolutePath("/", nodePath.posix)).toBe("/");
    expect(normalizeAbsolutePath("C:\\", nodePath.win32)).toBe("C:\\");
  });

  it("rejects relative paths", () => {
    expect(normalizeAbsolutePath("src/a.ts", nodePath.posix)).toBeUndefined();
    expect(normalizeAbsolutePath("..\\a.ts", nodePath.win32)).toBeUndefined();
  });

  it("rejects NUL characters", () => {
    expect(normalizeAbsolutePath("/ws/a\0.ts", nodePath.posix)).toBeUndefined();
  });
});

describe("isStrictlyInside", () => {
  it("accepts nested files", () => {
    expect(isStrictlyInside("/ws/src/a.ts", "/ws", nodePath.posix)).toBe(true);
  });

  it("rejects the root itself", () => {
    expect(isStrictlyInside("/ws", "/ws", nodePath.posix)).toBe(false);
  });

  it("rejects siblings sharing a name prefix", () => {
    expect(isStrictlyInside("/ws-other/a.ts", "/ws", nodePath.posix)).toBe(false);
  });

  it("rejects parent directories", () => {
    expect(isStrictlyInside("/a.ts", "/ws", nodePath.posix)).toBe(false);
  });

  it("accepts names that merely start with two dots", () => {
    expect(isStrictlyInside("/ws/..hidden/a.ts", "/ws", nodePath.posix)).toBe(true);
  });

  it("is case-insensitive on win32", () => {
    expect(isStrictlyInside("c:\\WS\\a.ts", "C:\\ws", nodePath.win32)).toBe(true);
  });

  it("rejects other drives on win32", () => {
    expect(isStrictlyInside("D:\\ws\\a.ts", "C:\\ws", nodePath.win32)).toBe(false);
  });
});
