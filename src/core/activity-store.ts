import type { AgentFileEvent } from "../models/agent-file-event";

export const DEFAULT_MAX_ACTIVITY_ENTRIES = 500;

export interface ActivityStoreOptions {
  readonly maxEntries?: number;
}

type ChangeListener = () => void;

export class ActivityStore {
  private entries: AgentFileEvent[] = [];
  private readonly listeners = new Set<ChangeListener>();
  private readonly maxEntries: number;

  constructor(options: ActivityStoreOptions = {}) {
    const maxEntries = options.maxEntries ?? DEFAULT_MAX_ACTIVITY_ENTRIES;
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      throw new RangeError("maxEntries must be a positive integer");
    }
    this.maxEntries = maxEntries;
  }

  add(event: AgentFileEvent): void {
    this.entries.push(event);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(this.entries.length - this.maxEntries);
    }
    this.notify();
  }

  list(): readonly AgentFileEvent[] {
    return [...this.entries].reverse();
  }

  clear(): void {
    if (this.entries.length === 0) {
      return;
    }
    this.entries = [];
    this.notify();
  }

  onDidChange(listener: ChangeListener): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}
