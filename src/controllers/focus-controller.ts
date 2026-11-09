import type { AgentFileEvent } from "../models/agent-file-event";

export type FocusMode = "auto" | "notify" | "off";

export const DEFAULT_FOCUS_MODE: FocusMode = "auto";

/** How often a deferred open re-checks whether the user is still typing. */
export const BUSY_RETRY_MS = 500;

/** A deferred open is dropped after this long, because the edit it announced is long over. */
export const MAX_DEFER_MS = 10_000;

export function parseFocusMode(value: unknown): FocusMode {
  return value === "auto" || value === "notify" || value === "off" ? value : DEFAULT_FOCUS_MODE;
}

export type FocusSkipReason =
  | "not-pre-edit"
  | "paused"
  | "focus-off"
  | "queued"
  | "deferred"
  | "notified"
  | "error";

export type FocusOutcome =
  | { readonly focused: true }
  | { readonly focused: false; readonly reason: FocusSkipReason };

export interface FocusControllerOptions {
  readonly openFile: (filePath: string) => Promise<void>;
  readonly notifyFile: (event: AgentFileEvent) => void;
  readonly isPaused: () => boolean;
  readonly isUserBusy: () => boolean;
  readonly getMode: () => FocusMode;
  readonly getCooldownMs: () => number;
  readonly reportError: (error: unknown) => void;
}

function isPreEditEvent(event: AgentFileEvent): boolean {
  return event.source === "adapter" && event.status === "started" && event.action === "edit";
}

export class FocusController {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pendingEvent: AgentFileEvent | undefined;
  private deferredSince: number | undefined;

  constructor(private readonly options: FocusControllerOptions) {}

  async handle(event: AgentFileEvent): Promise<FocusOutcome> {
    if (!isPreEditEvent(event)) {
      return { focused: false, reason: "not-pre-edit" };
    }
    if (this.options.isPaused()) {
      return { focused: false, reason: "paused" };
    }
    const mode = this.options.getMode();
    if (mode === "off") {
      return { focused: false, reason: "focus-off" };
    }
    if (this.timer !== undefined) {
      this.pendingEvent = event;
      return { focused: false, reason: "queued" };
    }
    if (this.shouldDefer(mode)) {
      this.deferredSince = Date.now();
      this.defer(event);
      return { focused: false, reason: "deferred" };
    }
    return this.present(event, mode);
  }

  dispose(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.pendingEvent = undefined;
    this.deferredSince = undefined;
  }

  /** Only opening can steal the editor from someone typing; a notification cannot. */
  private shouldDefer(mode: FocusMode): boolean {
    return mode === "auto" && this.options.isUserBusy();
  }

  /** Auto mode opens the file; notify mode only offers it. Both share the cooldown and queue. */
  private async present(event: AgentFileEvent, mode: Exclude<FocusMode, "off">): Promise<FocusOutcome> {
    this.startCooldown();
    try {
      if (mode === "auto") {
        await this.options.openFile(event.filePath);
        return { focused: true };
      }
      this.options.notifyFile(event);
      return { focused: false, reason: "notified" };
    } catch (error) {
      this.options.reportError(error);
      return { focused: false, reason: "error" };
    }
  }

  /**
   * After a presentation, further requests wait for the cooldown and only the latest one is
   * presented when it ends, so a burst of edits cannot flip the editor between files.
   */
  private startCooldown(): void {
    const cooldownMs = this.options.getCooldownMs();
    if (cooldownMs <= 0) {
      return;
    }
    this.timer = setTimeout(() => {
      this.flush();
    }, cooldownMs);
  }

  private defer(event: AgentFileEvent): void {
    this.pendingEvent = event;
    this.timer = setTimeout(() => {
      this.flush();
    }, BUSY_RETRY_MS);
  }

  /** Presents the latest queued event unless the state changed while it waited. */
  private flush(): void {
    this.timer = undefined;
    const next = this.pendingEvent;
    this.pendingEvent = undefined;
    if (next === undefined || this.options.isPaused()) {
      this.deferredSince = undefined;
      return;
    }
    const mode = this.options.getMode();
    if (mode === "off") {
      this.deferredSince = undefined;
      return;
    }
    if (this.shouldDefer(mode)) {
      const since = this.deferredSince ?? Date.now();
      if (Date.now() - since < MAX_DEFER_MS) {
        this.deferredSince = since;
        this.defer(next);
      } else {
        this.deferredSince = undefined;
      }
      return;
    }
    this.deferredSince = undefined;
    void this.present(next, mode);
  }
}
