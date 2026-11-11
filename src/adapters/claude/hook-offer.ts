import nodePath from "node:path";
import type { HookStatus } from "./hook-installer";

export const OFFER_INSTALL = "Install";
export const OFFER_NEVER = "Don't ask again";

export type HookOfferOutcome =
  | "disabled"
  | "untrusted"
  | "no-folder"
  | "opted-out"
  | "already-offered"
  | "no-claude-code"
  | "already-installed"
  | "unreadable"
  | "installed"
  | "declined"
  | "never"
  | "failed";

export interface OfferStore {
  /** The user pressed "Don't ask again" in some workspace. */
  isOptedOut(): boolean;
  wasOfferedHere(): boolean;
  markOfferedHere(): Promise<void>;
  optOut(): Promise<void>;
}

export interface HookOfferDeps {
  readonly isEnabled: () => boolean;
  readonly isTrusted: () => boolean;
  /** The workspace folder the hook would be installed in, or undefined when none is open. */
  readonly folder: string | undefined;
  readonly homeFolder: string;
  readonly pathExists: (target: string) => Promise<boolean>;
  readonly inspect: (settingsPath: string) => Promise<HookStatus>;
  readonly store: OfferStore;
  /** Shows the question and resolves with the button pressed, or undefined when it was closed. */
  readonly ask: (message: string, install: string, never: string) => Promise<string | undefined>;
  /** Runs the install without a second confirmation (the button was the confirmation). True when the hook is in place. */
  readonly install: () => Promise<boolean>;
  readonly log: (line: string) => void;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Claude Code is likely in use when the user has its folder or this project has one of its files. */
async function looksLikeClaudeCodeUser(deps: HookOfferDeps, folder: string): Promise<boolean> {
  const signs = [
    nodePath.join(folder, ".claude"),
    nodePath.join(folder, "CLAUDE.md"),
    nodePath.join(deps.homeFolder, ".claude"),
  ];
  for (const sign of signs) {
    if (await deps.pathExists(sign)) {
      return true;
    }
  }
  return false;
}

function question(folder: string): string {
  return (
    `AgentLens can open each file before Claude Code edits it. Add its hook to .claude/settings.local.json in the project "${nodePath.basename(folder)}"? ` +
    "The hook only reports the file path, session id and tool name to this window. It never blocks Claude Code."
  );
}

/**
 * Offers, once per workspace, to install the Claude Code hook, because without it AgentLens only sees changes
 * after they happen and opens nothing. The file is written only when the user presses Install.
 */
export async function runHookOffer(deps: HookOfferDeps, options: { readonly repeat?: boolean } = {}): Promise<HookOfferOutcome> {
  if (!deps.isEnabled()) {
    return "disabled";
  }
  if (!deps.isTrusted()) {
    return "untrusted";
  }
  const folder = deps.folder;
  if (folder === undefined) {
    return "no-folder";
  }
  if (deps.store.isOptedOut()) {
    return "opted-out";
  }
  if (options.repeat !== true && deps.store.wasOfferedHere()) {
    return "already-offered";
  }
  if (!(await looksLikeClaudeCodeUser(deps, folder))) {
    return "no-claude-code";
  }

  const status = await deps.inspect(nodePath.join(folder, ".claude", "settings.local.json"));
  if (status.kind === "installed") {
    return "already-installed";
  }
  if (status.kind === "unreadable") {
    deps.log(`Claude Code hook offer skipped: ${status.reason}`);
    return "unreadable";
  }

  try {
    await deps.store.markOfferedHere();
  } catch (error) {
    deps.log(`Claude Code hook offer skipped because it could not be remembered: ${describeError(error)}`);
    return "failed";
  }

  let answer: string | undefined;
  try {
    answer = await deps.ask(question(folder), OFFER_INSTALL, OFFER_NEVER);
  } catch (error) {
    deps.log(`Claude Code hook offer could not be shown: ${describeError(error)}`);
    return "failed";
  }

  if (answer === OFFER_NEVER) {
    try {
      await deps.store.optOut();
    } catch (error) {
      deps.log(`Claude Code hook offer opt-out could not be saved: ${describeError(error)}`);
    }
    return "never";
  }
  if (answer !== OFFER_INSTALL) {
    return "declined";
  }
  try {
    return (await deps.install()) ? "installed" : "failed";
  } catch (error) {
    deps.log(`Claude Code hook install from the offer failed: ${describeError(error)}`);
    return "failed";
  }
}
