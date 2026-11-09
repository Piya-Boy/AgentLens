import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import nodePath from "node:path";
import { addHook, removeHook, type SettingsEdit } from "./hook-settings";

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

async function writeAtomically(settingsPath: string, settings: Record<string, unknown>): Promise<void> {
  await mkdir(nodePath.dirname(settingsPath), { recursive: true });
  const temporaryPath = `${settingsPath}.agentlens.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await rename(temporaryPath, settingsPath);
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
  await writeAtomically(settingsPath, result.settings);
  return { ok: true, changed: true };
}

export function installHook(settingsPath: string, hookCommand: string): Promise<InstallResult> {
  return applyEdit(settingsPath, (settings) => addHook(settings, hookCommand), true);
}

export function uninstallHook(settingsPath: string): Promise<InstallResult> {
  return applyEdit(settingsPath, removeHook, false);
}
