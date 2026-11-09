import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PathEscapeError, resolveWithinWorkspace } from "./safe-path";

let base: string;
let workspace: string;
let outside: string;

beforeAll(async () => {
  base = await realpath(await mkdtemp(path.join(tmpdir(), "agentlens-safe-path-")));
  workspace = path.join(base, "workspace");
  outside = path.join(base, "outside");
  await mkdir(path.join(workspace, "src"), { recursive: true });
  await mkdir(path.join(workspace, "inner-target"), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(path.join(workspace, "src", "a.ts"), "a");
  await writeFile(path.join(workspace, "inner-target", "b.ts"), "b");
  await writeFile(path.join(outside, "secret.txt"), "secret");
  await symlink(outside, path.join(workspace, "escape"), "junction");
  await symlink(path.join(workspace, "inner-target"), path.join(workspace, "inner-link"), "junction");
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe("resolveWithinWorkspace", () => {
  it("returns the real path of a regular file inside the workspace", async () => {
    const file = path.join(workspace, "src", "a.ts");
    await expect(resolveWithinWorkspace(file, [workspace])).resolves.toBe(file);
  });

  it("follows a link that stays inside the workspace and returns the target", async () => {
    await expect(resolveWithinWorkspace(path.join(workspace, "inner-link", "b.ts"), [workspace])).resolves.toBe(
      path.join(workspace, "inner-target", "b.ts"),
    );
  });

  it("rejects a link that leads outside the workspace", async () => {
    await expect(resolveWithinWorkspace(path.join(workspace, "escape", "secret.txt"), [workspace])).rejects.toBeInstanceOf(
      PathEscapeError,
    );
  });

  it("rejects a real file outside the workspace", async () => {
    await expect(resolveWithinWorkspace(path.join(outside, "secret.txt"), [workspace])).rejects.toBeInstanceOf(
      PathEscapeError,
    );
  });

  it("accepts a file inside any of several roots", async () => {
    const file = path.join(outside, "secret.txt");
    await expect(resolveWithinWorkspace(file, [workspace, outside])).resolves.toBe(file);
  });

  it("rejects everything when there are no usable roots", async () => {
    const file = path.join(workspace, "src", "a.ts");
    await expect(resolveWithinWorkspace(file, [])).rejects.toBeInstanceOf(PathEscapeError);
    await expect(resolveWithinWorkspace(file, [path.join(base, "missing")])).rejects.toBeInstanceOf(PathEscapeError);
  });

  it("rejects with the fs error when the file does not exist", async () => {
    await expect(resolveWithinWorkspace(path.join(workspace, "src", "missing.ts"), [workspace])).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
