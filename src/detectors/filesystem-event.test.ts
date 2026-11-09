import nodePath from "node:path";
import { describe, expect, it } from "vitest";
import { validateAgentFileEvent } from "../core/event-validator";
import { createFilesystemEvent, isIgnoredPath, type FilesystemChangeKind } from "./filesystem-event";

describe("createFilesystemEvent", () => {
  it.each([
    ["create", "create"],
    ["change", "edit"],
    ["delete", "delete"],
  ] as const)("maps %s to action %s as an observation, not a pre-edit event", (kind, action) => {
    expect(createFilesystemEvent(kind, "/ws/a.ts", 1234, "id-1")).toEqual({
      eventId: "id-1",
      agentId: "unknown",
      sessionId: "filesystem",
      action,
      status: "observed",
      filePath: "/ws/a.ts",
      timestamp: 1234,
      source: "filesystem",
    });
  });

  it.each<FilesystemChangeKind>(["create", "change", "delete"])("produces a valid %s event", (kind) => {
    const result = validateAgentFileEvent(createFilesystemEvent(kind, "/ws/a.ts", 1234, "id-1"), {
      workspaceRoots: ["/ws"],
      pathApi: nodePath.posix,
    });
    expect(result.ok).toBe(true);
  });
});

describe("isIgnoredPath", () => {
  const ignored = [".git", "node_modules"];
  const check = (filePath: string, roots: readonly string[] = ["/ws"]): boolean =>
    isIgnoredPath(filePath, roots, ignored, nodePath.posix);

  it("ignores files under an ignored folder at any depth", () => {
    expect(check("/ws/.git/HEAD")).toBe(true);
    expect(check("/ws/packages/app/node_modules/x/index.js")).toBe(true);
  });

  it("ignores the ignored folder itself", () => {
    expect(check("/ws/node_modules")).toBe(true);
  });

  it("keeps ordinary files", () => {
    expect(check("/ws/src/a.ts")).toBe(false);
    expect(check("/ws/src/node_modules_notes.md")).toBe(false);
  });

  it("matches whole segments only", () => {
    expect(check("/ws/my.git/a.ts")).toBe(false);
  });

  it("only looks inside the workspace, not at the root path itself", () => {
    expect(check("/projects/node_modules/app/src/a.ts", ["/projects/node_modules/app"])).toBe(false);
  });

  it("does not ignore paths outside every root", () => {
    expect(check("/elsewhere/.git/HEAD")).toBe(false);
  });

  it("does not ignore anything when the list is empty", () => {
    expect(isIgnoredPath("/ws/.git/HEAD", ["/ws"], [], nodePath.posix)).toBe(false);
  });

  it("ignores nothing for unusable paths", () => {
    expect(check("relative/.git/HEAD")).toBe(false);
  });
});
