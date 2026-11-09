export const HOOK_MARKER = "--agentlens";
export const HOOK_MATCHER = "Edit|Write";
export const HOOK_TIMEOUT_SECONDS = 5;

export type SettingsEdit =
  | { readonly ok: true; readonly settings: Record<string, unknown>; readonly changed: boolean }
  | { readonly ok: false; readonly error: string };

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Characters that a shell expands or that end the quoted path inside the generated command. */
const SHELL_UNSAFE_PATH = /["`$%!\r\n\0]/;

export function isShellSafePath(hookScriptPath: string): boolean {
  return !SHELL_UNSAFE_PATH.test(hookScriptPath);
}

export function buildHookCommand(hookScriptPath: string): string {
  const portablePath = hookScriptPath.replaceAll("\\", "/");
  return `node "${portablePath}" ${HOOK_MARKER}`;
}

function isOurHandler(handler: unknown): boolean {
  return isObject(handler) && typeof handler.command === "string" && handler.command.endsWith(` ${HOOK_MARKER}`);
}

function withoutOurHandlers(groups: unknown[]): unknown[] {
  const kept: unknown[] = [];
  for (const group of groups) {
    if (!isObject(group) || !Array.isArray(group.hooks)) {
      kept.push(group);
      continue;
    }
    const remaining = group.hooks.filter((handler: unknown) => !isOurHandler(handler));
    if (remaining.length === group.hooks.length) {
      kept.push(group);
    } else if (remaining.length > 0) {
      kept.push({ ...group, hooks: remaining });
    }
  }
  return kept;
}

function readPreToolUse(settings: JsonObject): { hooks: JsonObject; groups: unknown[] } | string {
  const hooks = settings.hooks ?? {};
  if (!isObject(hooks)) {
    return "settings.hooks must be an object";
  }
  const groups = hooks.PreToolUse ?? [];
  if (!Array.isArray(groups)) {
    return "settings.hooks.PreToolUse must be an array";
  }
  return { hooks, groups };
}

function omit(object: JsonObject, key: string): JsonObject {
  return Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));
}

function finish(before: JsonObject, after: JsonObject): SettingsEdit {
  return { ok: true, settings: after, changed: JSON.stringify(before) !== JSON.stringify(after) };
}

/** Adds or refreshes the AgentLens PreToolUse hook and leaves every other entry untouched. */
export function addHook(settings: unknown, command: string): SettingsEdit {
  if (!isObject(settings)) {
    return { ok: false, error: "settings must be a JSON object" };
  }
  const current = readPreToolUse(settings);
  if (typeof current === "string") {
    return { ok: false, error: current };
  }
  const groups = [
    ...withoutOurHandlers(current.groups),
    { matcher: HOOK_MATCHER, hooks: [{ type: "command", command, timeout: HOOK_TIMEOUT_SECONDS }] },
  ];
  return finish(settings, { ...settings, hooks: { ...current.hooks, PreToolUse: groups } });
}

/** Removes only the AgentLens hook, and drops containers that become empty because of it. */
export function removeHook(settings: unknown): SettingsEdit {
  if (!isObject(settings)) {
    return { ok: false, error: "settings must be a JSON object" };
  }
  const current = readPreToolUse(settings);
  if (typeof current === "string") {
    return { ok: false, error: current };
  }
  if (settings.hooks === undefined || current.hooks.PreToolUse === undefined) {
    return finish(settings, settings);
  }

  const groups = withoutOurHandlers(current.groups);
  const otherHooks = omit(current.hooks, "PreToolUse");
  const hooks = groups.length > 0 ? { ...otherHooks, PreToolUse: groups } : otherHooks;
  const rest = omit(settings, "hooks");
  const next = Object.keys(hooks).length > 0 ? { ...rest, hooks } : rest;
  return finish(settings, next);
}
