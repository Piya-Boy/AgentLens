import { AGENT_ACTIONS, type AgentAction, type AgentFileEvent } from "../models/agent-file-event";

export interface ActivityFilter {
  readonly agentId?: string;
  readonly sessionId?: string;
  readonly action?: AgentAction;
}

export type FilterDimension = "agentId" | "sessionId" | "action";

export function isFilterActive(filter: ActivityFilter): boolean {
  return filter.agentId !== undefined || filter.sessionId !== undefined || filter.action !== undefined;
}

export function filterActivity(events: readonly AgentFileEvent[], filter: ActivityFilter): AgentFileEvent[] {
  return events.filter(
    (event) =>
      (filter.agentId === undefined || event.agentId === filter.agentId) &&
      (filter.sessionId === undefined || event.sessionId === filter.sessionId) &&
      (filter.action === undefined || event.action === filter.action),
  );
}

export function describeFilter(filter: ActivityFilter): string {
  const parts: string[] = [];
  if (filter.agentId !== undefined) {
    parts.push(`agent=${filter.agentId}`);
  }
  if (filter.sessionId !== undefined) {
    parts.push(`session=${filter.sessionId}`);
  }
  if (filter.action !== undefined) {
    parts.push(`action=${filter.action}`);
  }
  return parts.join(", ");
}

export function distinctValues(events: readonly AgentFileEvent[], dimension: FilterDimension): string[] {
  return [...new Set(events.map((event) => event[dimension]))].sort();
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined | null {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Returns undefined when the input has an invalid shape; an empty object means "no filter". */
export function parseFilterArgs(input: unknown): ActivityFilter | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return undefined;
  }
  const record = input as Record<string, unknown>;
  const agentId = optionalString(record, "agentId");
  const sessionId = optionalString(record, "sessionId");
  const action = optionalString(record, "action");
  if (agentId === null || sessionId === null || action === null) {
    return undefined;
  }
  if (action !== undefined && !(AGENT_ACTIONS as readonly string[]).includes(action)) {
    return undefined;
  }
  return {
    ...(agentId === undefined ? {} : { agentId }),
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(action === undefined ? {} : { action: action as AgentAction }),
  };
}

type ChangeListener = (filter: ActivityFilter) => void;

export class ActivityFilterState {
  private current: ActivityFilter = {};
  private readonly listeners = new Set<ChangeListener>();

  get filter(): ActivityFilter {
    return this.current;
  }

  set(filter: ActivityFilter): void {
    this.current = filter;
    for (const listener of [...this.listeners]) {
      listener(filter);
    }
  }

  clear(): void {
    if (isFilterActive(this.current)) {
      this.set({});
    }
  }

  onDidChange(listener: ChangeListener): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }
}
