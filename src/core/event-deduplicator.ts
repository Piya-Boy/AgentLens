import type { AgentFileEvent } from "../models/agent-file-event";

export const DEFAULT_DEDUP_WINDOW_MS = 500;
export const DEFAULT_DEDUP_MAX_ENTRIES = 1000;

export interface DeduplicatorOptions {
  readonly windowMs?: number;
  readonly maxEntries?: number;
}

export class EventDeduplicator {
  private readonly seenIds = new Set<string>();
  private readonly firstSeenByContent = new Map<string, number>();
  private readonly windowMs: number;
  private readonly maxEntries: number;

  constructor(options: DeduplicatorOptions = {}) {
    this.windowMs = options.windowMs ?? DEFAULT_DEDUP_WINDOW_MS;
    this.maxEntries = options.maxEntries ?? DEFAULT_DEDUP_MAX_ENTRIES;
    if (!Number.isSafeInteger(this.windowMs) || this.windowMs < 0) {
      throw new RangeError("windowMs must be a non-negative integer");
    }
    if (!Number.isSafeInteger(this.maxEntries) || this.maxEntries < 1) {
      throw new RangeError("maxEntries must be a positive integer");
    }
  }

  /**
   * An event is a duplicate when its id was already seen for the same agent and session
   * (retransmission), or when an event with identical content arrived within the window,
   * measured from the first accepted event (a hook firing twice).
   */
  isDuplicate(event: AgentFileEvent): boolean {
    const idKey = JSON.stringify([event.agentId, event.sessionId, event.eventId]);
    if (this.seenIds.has(idKey)) {
      return true;
    }
    this.seenIds.add(idKey);
    this.trimSet(this.seenIds);

    const contentKey = JSON.stringify([
      event.agentId,
      event.sessionId,
      event.source,
      event.action,
      event.status,
      event.filePath,
    ]);
    const firstSeen = this.firstSeenByContent.get(contentKey);
    if (firstSeen !== undefined && Math.abs(event.timestamp - firstSeen) <= this.windowMs) {
      return true;
    }

    this.firstSeenByContent.delete(contentKey);
    this.firstSeenByContent.set(contentKey, event.timestamp);
    while (this.firstSeenByContent.size > this.maxEntries) {
      const oldest = this.firstSeenByContent.keys().next();
      if (oldest.done === true) {
        break;
      }
      this.firstSeenByContent.delete(oldest.value);
    }
    return false;
  }

  private trimSet(set: Set<string>): void {
    while (set.size > this.maxEntries) {
      const oldest = set.values().next();
      if (oldest.done === true) {
        return;
      }
      set.delete(oldest.value);
    }
  }
}
