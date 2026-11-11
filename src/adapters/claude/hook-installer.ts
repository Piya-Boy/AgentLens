import { randomBytes } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import nodePath from "node:path";
import { addHook, hasHook, removeHook, type SettingsEdit } from "./hook-settings";

export type InstallResult =
  | { readonly ok: true; readonly changed: boolean }
  | { readonly ok: false; readonly error: string };

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function readSettings(settingsPath: string): Promise<{ exists: boolean; value: unknown } | string> {
  let text: string;
  try {
    text = await readFile(settingsPath, "utf8");
  } catch (error) {
    if (isMissingFile(error)) {
      return { exists: false, value: {} };
    }
    throw error;
  }
  try {
    return { exists: true, value: JSON.parse(text) as unknown };
  } catch {
    return `${settingsPath} is not valid JSON; it was not modified`;
  }
}

const PRIVATE_FILE_MODE = 0o600;

async function lstatOrUndefined(target: string): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
  try {
    return await lstat(target);
  } catch (error) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }
}

/** Refuses links, so an install can never write through a planted symlink or junction. */
async function findUnsafeTarget(settingsPath: string): Promise<string | undefined> {
  const directory = nodePath.dirname(settingsPath);
  const directoryInfo = await lstatOrUndefined(directory);
  if (directoryInfo?.isSymbolicLink() === true) {
    return `${directory} is a link; nothing was written`;
  }
  if (directoryInfo !== undefined && (await realpath(directory)) !== nodePath.resolve(directory)) {
    return `${directory} is reached through a link; nothing was written`;
  }
  const fileInfo = await lstatOrUndefined(settingsPath);
  if (fileInfo?.isSymbolicLink() === true) {
    return `${settingsPath} is a link; it was not modified`;
  }
  return undefined;
}

async function existingMode(settingsPath: string): Promise<number> {
  try {
    return (await stat(settingsPath)).mode & 0o777;
  } catch (error) {
    if (isMissingFile(error)) {
      return PRIVATE_FILE_MODE;
    }
    throw error;
  }
}

async function writeAtomically(settingsPath: string, settings: Record<string, unknown>): Promise<void> {
  await mkdir(nodePath.dirname(settingsPath), { recursive: true });
  const mode = await existingMode(settingsPath);
  const temporaryPath = `${settingsPath}.${randomBytes(6).toString("hex")}.agentlens.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode });
    await rename(temporaryPath, settingsPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function applyEdit(
  settingsPath: string,
  edit: (settings: unknown) => SettingsEdit,
  createWhenMissing: boolean,
): Promise<InstallResult> {
  const current = await readSettings(settingsPath);
  if (typeof current === "string") {
    return { ok: false, error: current };
  }
  const result = edit(current.value);
  if (!result.ok) {
    return { ok: false, error: `${settingsPath}: ${result.error}` };
  }
  if (!result.changed || (!current.exists && !createWhenMissing)) {
    return { ok: true, changed: false };
  }
  const unsafe = await findUnsafeTarget(settingsPath);
  if (unsafe !== undefined) {
    return { ok: false, error: unsafe };
  }
  await writeAtomically(settingsPath, result.settings);
  return { ok: true, changed: true };
}

export type HookStatus =
  | { readonly kind: "installed" }
  | { readonly kind: "missing" }
  | { readonly kind: "unreadable"; readonly reason: string };

/** Read-only: tells whether the AgentLens hook is in the settings file. Never writes or creates anything. */
export async function inspectHook(settingsPath: string): Promise<HookStatus> {
  let current: Awaited<ReturnType<typeof readSettings>>;
  try {
    current = await readSettings(settingsPath);
  } catch (error) {
    return { kind: "unreadable", reason: `${settingsPath} could not be read (${error instanceof Error ? error.message : String(error)})` };
  }
  if (typeof current === "string") {
    return { kind: "unreadable", reason: current };
  }
  return hasHook(current.value) ? { kind: "installed" } : { kind: "missing" };
}

export function installHook(settingsPath: string, hookCommand: string): Promise<InstallResult> {
  return applyEdit(settingsPath, (settings) => addHook(settings, hookCommand), true);
}

export function uninstallHook(settingsPath: string): Promise<InstallResult> {
  return applyEdit(settingsPath, removeHook, false);
}
