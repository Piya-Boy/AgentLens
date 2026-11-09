import type { AgentAction, AgentEventStatus, AgentFileEvent } from "../models/agent-file-event";

export const DEFAULT_MAX_SESSIONS = 50;

export interface SessionInfo {
  readonly agentId: string;
  readonly sessionId: string;
  readonly firstSeen: number;
  readonly lastSeen: number;
  readonly eventCount: number;
  readonly lastFilePath: string;
  readonly lastAction: AgentAction;
  readonly lastStatus: AgentEventStatus;
}

export interface SessionManagerOptions {
  readonly maxSessions?: number;
}

type ChangeListener = (session: SessionInfo) => void;

function sessionKey(agentId: string, sessionId: string): string {
  return JSON.stringify([agentId, sessionId]);
}

export class SessionManager {
  private readonly sessions = new Map<string, SessionInfo>();
  private readonly listeners = new Set<ChangeListener>();
  private readonly maxSessions: number;

  constructor(options: SessionManagerOptions = {}) {
    const maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
    if (!Number.isSafeInteger(maxSessions) || maxSessions < 1) {
      throw new RangeError("maxSessions must be a positive integer");
    }
    this.maxSessions = maxSessions;
  }

  record(event: AgentFileEvent): SessionInfo {
    const key = sessionKey(event.agentId, event.sessionId);
    const previous = this.sessions.get(key);
    const newest = previous === undefined || event.timestamp >= previous.lastSeen;

    const updated: SessionInfo = {
      agentId: event.agentId,
      sessionId: event.sessionId,
      firstSeen: previous === undefined ? event.timestamp : Math.min(previous.firstSeen, event.timestamp),
      lastSeen: previous === undefined ? event.timestamp : Math.max(previous.lastSeen, event.timestamp),
      eventCount: (previous?.eventCount ?? 0) + 1,
      lastFilePath: newest ? event.filePath : (previous?.lastFilePath ?? event.filePath),
      lastAction: newest ? event.action : (previous?.lastAction ?? event.action),
      lastStatus: newest ? event.status : (previous?.lastStatus ?? event.status),
    };

    this.sessions.delete(key);
    this.sessions.set(key, updated);
    this.evictOverflow();
    this.listeners.forEach((listener) => {
      listener(updated);
    });
    return updated;
  }

  get(agentId: string, sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionKey(agentId, sessionId));
  }

  list(): readonly SessionInfo[] {
    return [...this.sessions.values()].sort((a, b) => b.lastSeen - a.lastSeen);
  }

  onDidChange(listener: ChangeListener): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  private evictOverflow(): void {
    while (this.sessions.size > this.maxSessions) {
      const oldest = this.sessions.keys().next();
      if (oldest.done === true) {
        return;
      }
      this.sessions.delete(oldest.value);
    }
  }
}
