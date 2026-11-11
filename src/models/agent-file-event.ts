export const AGENT_ACTIONS = ["read", "create", "edit", "delete"] as const;
export type AgentAction = (typeof AGENT_ACTIONS)[number];

export const AGENT_EVENT_STATUSES = ["started", "completed", "failed", "observed"] as const;
export type AgentEventStatus = (typeof AGENT_EVENT_STATUSES)[number];

export const AGENT_EVENT_SOURCES = ["adapter", "filesystem"] as const;
export type AgentEventSource = (typeof AGENT_EVENT_SOURCES)[number];

export interface AgentFileEvent {
  readonly eventId: string;
  readonly agentId: string;
  readonly sessionId: string;
  readonly action: AgentAction;
  readonly status: AgentEventStatus;
  readonly filePath: string;
  readonly timestamp: number;
  readonly toolName?: string;
  readonly source: AgentEventSource;
}
