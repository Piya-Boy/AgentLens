import nodePath from "node:path";
import { describe, expect, it } from "vitest";
import { pathKey } from "./path-key";

describe("pathKey", () => {
  const mixed = nodePath.join(nodePath.sep, "Work", "..", "Work", "Src", "A.ts");

  it("normalizes the path", () => {
    expect(pathKey(mixed, "linux")).toBe(nodePath.join(nodePath.sep, "Work", "Src", "A.ts"));
  });

  it("keeps case on Linux", () => {
    expect(pathKey(nodePath.join(nodePath.sep, "Work", "A.ts"), "linux")).toContain("Work");
  });

  it.each(["win32", "darwin"] as const)("folds case on %s", (platform) => {
    expect(pathKey(nodePath.join(nodePath.sep, "Work", "A.ts"), platform)).toBe(
      nodePath.join(nodePath.sep, "work", "a.ts"),
    );
  });
});
