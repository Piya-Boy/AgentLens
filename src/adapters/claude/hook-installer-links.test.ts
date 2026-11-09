import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { installHook, uninstallHook } from "./hook-installer";
import { buildHookCommand } from "./hook-settings";

let base: string;
let counter = 0;
const command = buildHookCommand("/ext/dist/hook.js");
const directoryLinkType = process.platform === "win32" ? "junction" : "dir";

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), "agentlens-links-"));
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

async function newProject(): Promise<string> {
  counter += 1;
  const project = path.join(base, `project-${String(counter)}`);
  await mkdir(project, { recursive: true });
  return project;
}

describe("installHook link safety", () => {
  it("refuses to write through a linked .claude folder", async () => {
    const project = await newProject();
    const outside = path.join(base, `outside-${String(counter)}`);
    await mkdir(outside);
    await symlink(outside, path.join(project, ".claude"), directoryLinkType);

    const result = await installHook(path.join(project, ".claude", "settings.local.json"), command);

    expect(result).toMatchObject({ ok: false });
    expect(await readdir(outside)).toEqual([]);
  });

  it("refuses to replace a settings file that is a link", async (context) => {
    const project = await newProject();
    const victim = path.join(project, "dotfiles-settings.json");
    await writeFile(victim, "{}\n");
    await mkdir(path.join(project, ".claude"));
    const settings = path.join(project, ".claude", "settings.local.json");
    try {
      await symlink(victim, settings, "file");
    } catch {
      context.skip();
      return;
    }

    const result = await installHook(settings, command);

    expect(result).toMatchObject({ ok: false });
    expect(await readFile(victim, "utf8")).toBe("{}\n");
  });

  it("never follows a symlink planted at the old fixed temporary name", async (context) => {
    const project = await newProject();
    const victim = path.join(project, "victim.txt");
    await writeFile(victim, "keep me");
    await mkdir(path.join(project, ".claude"));
    const settings = path.join(project, ".claude", "settings.local.json");
    try {
      await symlink(victim, `${settings}.agentlens.tmp`, "file");
    } catch {
      context.skip();
      return;
    }

    const result = await installHook(settings, command);

    expect(result).toEqual({ ok: true, changed: true });
    expect(await readFile(victim, "utf8")).toBe("keep me");
  });

  it("leaves no temporary file behind", async () => {
    const project = await newProject();
    await installHook(path.join(project, ".claude", "settings.local.json"), command);

    expect(await readdir(path.join(project, ".claude"))).toEqual(["settings.local.json"]);
  });
});

describe.skipIf(process.platform === "win32")("installHook file mode", () => {
  it("keeps the mode of an existing settings file", async () => {
    const project = await newProject();
    const settings = path.join(project, ".claude", "settings.local.json");
    await mkdir(path.dirname(settings));
    await writeFile(settings, '{"env":{"TOKEN":"x"}}\n');
    await chmod(settings, 0o600);

    await installHook(settings, command);
    expect((await stat(settings)).mode & 0o777).toBe(0o600);

    await uninstallHook(settings);
    expect((await stat(settings)).mode & 0o777).toBe(0o600);
  });

  it("creates a new settings file readable only by its owner", async () => {
    const project = await newProject();
    const settings = path.join(project, ".claude", "settings.local.json");

    await installHook(settings, command);

    expect((await stat(settings)).mode & 0o777).toBe(0o600);
  });
});
