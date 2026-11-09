import { parseLatestRelease, type LatestRelease } from "./release";
import { compareVersions, parseVersion } from "./version";

export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const LAST_CHECK_KEY = "agentlens.update.lastCheck";
export const LAST_NOTIFIED_KEY = "agentlens.update.lastNotified";

/** The part of `vscode.Memento` that is used, so the checker can be tested without VS Code. */
export interface UpdateState {
  get(key: string): unknown;
  update(key: string, value: unknown): PromiseLike<void>;
}

export interface UpdateCheckerOptions {
  readonly currentVersion: string;
  readonly fetchLatest: () => Promise<unknown>;
  readonly state: UpdateState;
  readonly now: () => number;
  readonly reportError: (error: unknown) => void;
}

export type UpdateOutcome =
  | { readonly kind: "up-to-date"; readonly current: string }
  | { readonly kind: "update-available"; readonly current: string; readonly release: LatestRelease }
  | { readonly kind: "failed"; readonly reason: string }
  | { readonly kind: "skipped"; readonly reason: "checked-recently" | "already-notified" };

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Asks where the newest release is and compares it with the installed version. It never downloads
 * or installs anything: VS Code installs and updates extensions, and this only reports.
 */
export class UpdateChecker {
  private inFlight: Promise<UpdateOutcome> | undefined;

  constructor(private readonly options: UpdateCheckerOptions) {}

  /** Checks regardless of when the last check was, for an explicit request. */
  async checkNow(): Promise<UpdateOutcome> {
    const outcome = await this.check();
    if (outcome.kind === "update-available") {
      await this.remember(LAST_NOTIFIED_KEY, outcome.release.label);
    }
    return outcome;
  }

  /** At most one check a day, and each newer version is reported once. */
  async checkIfDue(): Promise<UpdateOutcome> {
    const last = this.options.state.get(LAST_CHECK_KEY);
    if (typeof last === "number") {
      const age = this.options.now() - last;
      if (age >= 0 && age < CHECK_INTERVAL_MS) {
        return { kind: "skipped", reason: "checked-recently" };
      }
    }
    const outcome = await this.check();
    if (outcome.kind !== "update-available") {
      return outcome;
    }
    if (this.options.state.get(LAST_NOTIFIED_KEY) === outcome.release.label) {
      return { kind: "skipped", reason: "already-notified" };
    }
    await this.remember(LAST_NOTIFIED_KEY, outcome.release.label);
    return outcome;
  }

  private check(): Promise<UpdateOutcome> {
    this.inFlight ??= this.run().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async run(): Promise<UpdateOutcome> {
    const current = parseVersion(this.options.currentVersion);
    if (current === undefined) {
      return { kind: "failed", reason: `the installed version "${this.options.currentVersion}" is not major.minor.patch` };
    }
    let body: unknown;
    try {
      body = await this.options.fetchLatest();
    } catch (error) {
      await this.remember(LAST_CHECK_KEY, this.options.now());
      return { kind: "failed", reason: describeError(error) };
    }
    await this.remember(LAST_CHECK_KEY, this.options.now());
    const release = parseLatestRelease(body);
    if (release === undefined) {
      return { kind: "failed", reason: "the answer was not a usable release" };
    }
    const label = this.options.currentVersion.replace(/^v/, "");
    return compareVersions(release.version, current) > 0
      ? { kind: "update-available", current: label, release }
      : { kind: "up-to-date", current: label };
  }

  private async remember(key: string, value: unknown): Promise<void> {
    try {
      await this.options.state.update(key, value);
    } catch (error) {
      this.options.reportError(error);
    }
  }
}
