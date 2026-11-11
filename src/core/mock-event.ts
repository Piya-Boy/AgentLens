import type { AgentFileEvent } from "../models/agent-file-event";

export const MOCK_AGENT_ID = "mock";
export const MOCK_SESSION_ID = "mock-session";

export function createMockEvent(filePath: string, timestamp: number, eventId: string): AgentFileEvent {
  return {
    eventId,
    agentId: MOCK_AGENT_ID,
    sessionId: MOCK_SESSION_ID,
    action: "edit",
    status: "started",
    filePath,
    timestamp,
    toolName: "mock",
    source: "adapter",
  };
}
