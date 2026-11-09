import type { AgentFileEvent } from "../models/agent-file-event";

export type FocusSkipReason = "not-pre-edit" | "auto-focus-disabled" | "error";

export type FocusOutcome =
  | { readonly focused: true }
  | { readonly focused: false; readonly reason: FocusSkipReason };

export interface FocusControllerOptions {
  readonly openFile: (filePath: string) => Promise<void>;
  readonly isAutoFocusEnabled: () => boolean;
  readonly reportError: (error: unknown) => void;
}

function isPreEditEvent(event: AgentFileEvent): boolean {
  return event.source === "adapter" && event.status === "started" && event.action === "edit";
}

export class FocusController {
  constructor(private readonly options: FocusControllerOptions) {}

  async handle(event: AgentFileEvent): Promise<FocusOutcome> {
    if (!isPreEditEvent(event)) {
      return { focused: false, reason: "not-pre-edit" };
    }
    if (!this.options.isAutoFocusEnabled()) {
      return { focused: false, reason: "auto-focus-disabled" };
    }
    try {
      await this.options.openFile(event.filePath);
      return { focused: true };
    } catch (error) {
      this.options.reportError(error);
      return { focused: false, reason: "error" };
    }
  }
}
