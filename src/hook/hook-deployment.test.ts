import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deployHookScript, stableHookPath } from "./hook-deployment";

let base: string;
let caseCount = 0;

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), "ahd-"));
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

async function privateFolder(folder: string): Promise<void> {
  await mkdir(folder, { recursive: true });
  await chmod(folder, 0o700);
}

async function scenario(bundled: string): Promise<{ source: string; target: string; folder: string }> {
  caseCount += 1;
  const root = path.join(base, `case-${String(caseCount)}`);
  const folder = path.join(root, "state", "agentlens");
  await mkdir(root, { recursive: true });
  const source = path.join(root, "extension-1.0.0", "dist", "hook.js");
  await mkdir(path.dirname(source), { recursive: true });
  await writeFile(source, bundled);
  return { source, target: path.join(folder, "hook.js"), folder };
}

describe("stableHookPath", () => {
  it("sits beside the endpoint secret on Windows", () => {
    const location = { platform: "win32", homeDir: "C:\\Users\\a", localAppData: "C:\\Users\\a\\AppData\\Local" } as const;
    expect(stableHookPath(location)).toBe(path.join("C:\\Users\\a\\AppData\\Local", "agentlens", "hook.js"));
  });

  it("uses XDG_STATE_HOME, then ~/.local/state, on Unix", () => {
    expect(stableHookPath({ platform: "linux", homeDir: "/home/a", xdgStateHome: "/state" })).toBe(path.join("/state", "agentlens", "hook.js"));
    expect(stableHookPath({ platform: "linux", homeDir: "/home/a" })).toBe(path.join("/home/a", ".local", "state", "agentlens", "hook.js"));
  });
});

describe("deployHookScript", () => {
  it("creates the folder and the copy", async () => {
    const { source, target } = await scenario("hook v1");

    expect(deployHookScript(source, target)).toBe("created");

    expect(await readFile(target, "utf8")).toBe("hook v1");
  });

  it("leaves an identical copy alone", async () => {
    const { source, target, folder } = await scenario("hook v1");
    deployHookScript(source, target);
    const before = await stat(target);

    expect(deployHookScript(source, target)).toBe("unchanged");

    expect((await stat(target)).mtimeMs).toBe(before.mtimeMs);
    expect(await readdir(folder)).toEqual(["hook.js"]);
  });

  it("replaces the copy in place when a new extension version brings a new script, keeping the same path", async () => {
    const first = await scenario("hook v1");
    deployHookScript(first.source, first.target);
    const newVersion = path.join(path.dirname(first.source), "..", "..", "extension-1.1.0", "dist", "hook.js");
    await mkdir(path.dirname(newVersion), { recursive: true });
    await writeFile(newVersion, "hook v2");

    expect(deployHookScript(newVersion, first.target)).toBe("updated");

    expect(await readFile(first.target, "utf8")).toBe("hook v2");
    expect(await readdir(first.folder)).toEqual(["hook.js"]);
  });

  it("restores a copy that was edited", async () => {
    const { source, target } = await scenario("hook v1");
    deployHookScript(source, target);
    await writeFile(target, "tampered");

    expect(deployHookScript(source, target)).toBe("updated");

    expect(await readFile(target, "utf8")).toBe("hook v1");
  });

  it("fails and writes nothing when the bundled script is missing", async () => {
    const { source, target, folder } = await scenario("hook v1");
    await rm(source);

    expect(() => deployHookScript(source, target)).toThrow();

    await expect(readdir(folder)).rejects.toThrow();
  });

  it("refuses a folder in the place of the script", async () => {
    const { source, target } = await scenario("hook v1");
    await privateFolder(path.dirname(target));
    await mkdir(target);

    expect(() => deployHookScript(source, target)).toThrow("not a regular file");
  });

  it.skipIf(process.platform === "win32")("writes the copy readable by its owner only", async () => {
    const { source, target } = await scenario("hook v1");

    deployHookScript(source, target);

    expect((await stat(target)).mode & 0o777).toBe(0o600);
  });

  it.skipIf(process.platform === "win32")("refuses a symbolic link and does not write through it", async () => {
    const { source, target, folder } = await scenario("hook v1");
    const victim = path.join(base, `victim-${String(caseCount)}`);
    await writeFile(victim, "keep me");
    await privateFolder(folder);
    await symlink(victim, target);

    expect(() => deployHookScript(source, target)).toThrow("not a regular file");

    expect(await readFile(victim, "utf8")).toBe("keep me");
  });

  it.skipIf(process.platform === "win32")("refuses a folder that others can write and writes nothing into it", async () => {
    const { source, target, folder } = await scenario("hook v1");
    await mkdir(folder, { recursive: true });
    await chmod(folder, 0o777);

    expect(() => deployHookScript(source, target)).toThrow("writable by others");

    expect(await readdir(folder)).toEqual([]);
  });

  it.skipIf(process.platform === "win32")("refuses a folder that is a symbolic link", async () => {
    const { source, target, folder } = await scenario("hook v1");
    const elsewhere = path.join(base, `elsewhere-${String(caseCount)}`);
    await mkdir(elsewhere, { recursive: true });
    await mkdir(path.dirname(folder), { recursive: true });
    await symlink(elsewhere, folder);

    expect(() => deployHookScript(source, target)).toThrow("link or not a folder");

    expect(await readdir(elsewhere)).toEqual([]);
  });

  it.skipIf(process.platform === "win32")("refuses a copy that others can write", async () => {
    const { source, target, folder } = await scenario("hook v1");
    deployHookScript(source, target);
    await chmod(folder, 0o700);
    await chmod(target, 0o666);

    expect(() => deployHookScript(source, target)).toThrow("writable by others");
  });
});
