import type { AgentFileEvent } from "../models/agent-file-event";
import type { PathApi } from "../utils/path-utils";
import { EventDeduplicator } from "./event-deduplicator";
import { validateAgentFileEvent } from "./event-validator";

export type IngestResult =
  | { readonly accepted: true; readonly event: AgentFileEvent }
  | { readonly accepted: false; readonly reason: "invalid"; readonly errors: readonly string[] }
  | { readonly accepted: false; readonly reason: "duplicate" };

export type EventListener = (event: AgentFileEvent) => void;

export interface EventManagerOptions {
  readonly getWorkspaceRoots: () => readonly string[];
  readonly reportListenerError: (error: unknown) => void;
  readonly pathApi?: PathApi;
  readonly deduplicator?: EventDeduplicator;
}

export class EventManager {
  private readonly listeners = new Set<EventListener>();
  private readonly deduplicator: EventDeduplicator;

  constructor(private readonly options: EventManagerOptions) {
    this.deduplicator = options.deduplicator ?? new EventDeduplicator();
  }

  ingest(input: unknown): IngestResult {
    const result = validateAgentFileEvent(input, {
      workspaceRoots: this.options.getWorkspaceRoots(),
      ...(this.options.pathApi === undefined ? {} : { pathApi: this.options.pathApi }),
    });
    if (!result.ok) {
      return { accepted: false, reason: "invalid", errors: result.errors };
    }
    if (this.deduplicator.isDuplicate(result.event)) {
      return { accepted: false, reason: "duplicate" };
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
