import type { AgentFileEvent } from "../models/agent-file-event";

export type FocusSkipReason = "not-pre-edit" | "paused" | "auto-focus-disabled" | "queued" | "error";

export type FocusOutcome =
  | { readonly focused: true }
  | { readonly focused: false; readonly reason: FocusSkipReason };

export interface FocusControllerOptions {
  readonly openFile: (filePath: string) => Promise<void>;
  readonly isPaused: () => boolean;
  readonly isAutoFocusEnabled: () => boolean;
  readonly getCooldownMs: () => number;
  readonly reportError: (error: unknown) => void;
}

function isPreEditEvent(event: AgentFileEvent): boolean {
  return event.source === "adapter" && event.status === "started" && event.action === "edit";
}

export class FocusController {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pendingFilePath: string | undefined;

  constructor(private readonly options: FocusControllerOptions) {}

  async handle(event: AgentFileEvent): Promise<FocusOutcome> {
    if (!isPreEditEvent(event)) {
      return { focused: false, reason: "not-pre-edit" };
    }
    if (this.options.isPaused()) {
      return { focused: false, reason: "paused" };
    }
    if (!this.options.isAutoFocusEnabled()) {
      return { focused: false, reason: "auto-focus-disabled" };
    }
    if (this.timer !== undefined) {
      this.pendingFilePath = event.filePath;
      return { focused: false, reason: "queued" };
    }
    return this.open(event.filePath);
  }

  dispose(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.pendingFilePath = undefined;
  }

  private async open(filePath: string): Promise<FocusOutcome> {
    this.startCooldown();
    try {
      await this.options.openFile(filePath);
      return { focused: true };
    } catch (error) {
      this.options.reportError(error);
      return { focused: false, reason: "error" };
    }
  }

  /**
   * After an open, further requests wait for the cooldown and only the latest one is
   * opened when it ends, so a burst of edits cannot flip the editor between files.
   */
  private startCooldown(): void {
    const cooldownMs = this.options.getCooldownMs();
    if (cooldownMs <= 0) {
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      const next = this.pendingFilePath;
      this.pendingFilePath = undefined;
      if (next !== undefined && !this.options.isPaused() && this.options.isAutoFocusEnabled()) {
        void this.open(next);
      }
    }, cooldownMs);
  }
}
