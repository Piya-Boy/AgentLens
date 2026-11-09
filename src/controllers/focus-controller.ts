import type { AgentFileEvent } from "../models/agent-file-event";

export type FocusMode = "auto" | "notify" | "off";

export const DEFAULT_FOCUS_MODE: FocusMode = "auto";

export function parseFocusMode(value: unknown): FocusMode {
  return value === "auto" || value === "notify" || value === "off" ? value : DEFAULT_FOCUS_MODE;
}

export type FocusSkipReason = "not-pre-edit" | "paused" | "focus-off" | "queued" | "notified" | "error";

export type FocusOutcome =
  | { readonly focused: true }
  | { readonly focused: false; readonly reason: FocusSkipReason };

export interface FocusControllerOptions {
  readonly openFile: (filePath: string) => Promise<void>;
  readonly notifyFile: (event: AgentFileEvent) => void;
  readonly isPaused: () => boolean;
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
    return this.present(event, mode);
  }

  dispose(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.pendingEvent = undefined;
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
      this.timer = undefined;
      const next = this.pendingEvent;
      this.pendingEvent = undefined;
      if (next === undefined || this.options.isPaused()) {
        return;
      }
      const mode = this.options.getMode();
      if (mode !== "off") {
        void this.present(next, mode);
      }
    }, cooldownMs);
  }
}
