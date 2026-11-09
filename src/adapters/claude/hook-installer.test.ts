import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { installHook, uninstallHook } from "./hook-installer";
import { buildHookCommand } from "./hook-settings";

let base: string;
let counter = 0;
const command = buildHookCommand("/ext/dist/hook.js");

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), "agentlens-installer-"));
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

function newSettingsPath(): string {
  counter += 1;
  return path.join(base, `project-${String(counter)}`, ".claude", "settings.local.json");
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

describe("installHook", () => {
  it("creates the settings file and its directory when missing", async () => {
    const file = newSettingsPath();
    await expect(installHook(file, command)).resolves.toEqual({ ok: true, changed: true });
    expect(await readJson(file)).toMatchObject({ hooks: { PreToolUse: [{ matcher: "Edit|Write" }] } });
  });

  it("merges into an existing file without losing other settings", async () => {
    const file = newSettingsPath();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ permissions: { allow: ["Bash(ls)"] } }));

    await installHook(file, command);

    expect(await readJson(file)).toMatchObject({
      permissions: { allow: ["Bash(ls)"] },
      hooks: { PreToolUse: [{ hooks: [{ command }] }] },
    });
  });

  it("does not rewrite the file when nothing changes", async () => {
    const file = newSettingsPath();
    await installHook(file, command);
    const before = await readFile(file, "utf8");

    await expect(installHook(file, command)).resolves.toEqual({ ok: true, changed: false });

    expect(await readFile(file, "utf8")).toBe(before);
  });

  it("refuses to touch a file that is not valid JSON", async () => {
    const file = newSettingsPath();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "{ // comment\n}");

    const result = await installHook(file, command);

    expect(result).toMatchObject({ ok: false });
    expect(await readFile(file, "utf8")).toBe("{ // comment\n}");
  });

  it("refuses an unexpected structure and leaves the file as it was", async () => {
    const file = newSettingsPath();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, '{"hooks":"nope"}');

    expect(await installHook(file, command)).toMatchObject({ ok: false });
    expect(await readFile(file, "utf8")).toBe('{"hooks":"nope"}');
  });

  it("leaves no temporary file behind", async () => {
    const file = newSettingsPath();
    await installHook(file, command);
    expect(await readdir(path.dirname(file))).toEqual(["settings.local.json"]);
  });
});

describe("uninstallHook", () => {
  it("removes the hook and keeps the rest", async () => {
    const file = newSettingsPath();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ model: "opus" }));
    await installHook(file, command);

    await expect(uninstallHook(file)).resolves.toEqual({ ok: true, changed: true });

    expect(await readJson(file)).toEqual({ model: "opus" });
  });

  it("does not create a file when there is nothing to remove", async () => {
    const file = newSettingsPath();
    await expect(uninstallHook(file)).resolves.toEqual({ ok: true, changed: false });
    await expect(readFile(file, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses a file that is not valid JSON", async () => {
    const file = newSettingsPath();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "nope");
    expect(await uninstallHook(file)).toMatchObject({ ok: false });
    expect(await readFile(file, "utf8")).toBe("nope");
  });
});
