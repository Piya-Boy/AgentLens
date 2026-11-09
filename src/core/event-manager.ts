import type { AgentFileEvent } from "../models/agent-file-event";
import type { PathApi } from "../utils/path-utils";
import { validateAgentFileEvent } from "./event-validator";

export type IngestResult =
  | { readonly accepted: true; readonly event: AgentFileEvent }
  | { readonly accepted: false; readonly errors: readonly string[] };

export type EventListener = (event: AgentFileEvent) => void;

export interface EventManagerOptions {
  readonly getWorkspaceRoots: () => readonly string[];
  readonly reportListenerError: (error: unknown) => void;
  readonly pathApi?: PathApi;
}

export class EventManager {
  private readonly listeners = new Set<EventListener>();

  constructor(private readonly options: EventManagerOptions) {}

  ingest(input: unknown): IngestResult {
    const result = validateAgentFileEvent(input, {
      workspaceRoots: this.options.getWorkspaceRoots(),
      ...(this.options.pathApi === undefined ? {} : { pathApi: this.options.pathApi }),
    });
    if (!result.ok) {
      return { accepted: false, errors: result.errors };
    }
    this.dispatch(result.event);
    return { accepted: true, event: result.event };
  }

  onEvent(listener: EventListener): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  private dispatch(event: AgentFileEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        this.options.reportListenerError(error);
      }
    }
  }
}
