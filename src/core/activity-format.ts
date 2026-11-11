import nodePath from "node:path";
import type { AgentFileEvent } from "../models/agent-file-event";
import type { SessionInfo } from "./session-manager";

export type TimeFormatter = (timestamp: number) => string;

export interface ItemDescription {
  readonly label: string;
  readonly description: string;
  readonly tooltip: string;
}

export interface StatusDescription {
  readonly text: string;
  readonly tooltip: string;
}

export function describeEvent(event: AgentFileEvent, formatTime: TimeFormatter): ItemDescription {
  const stage = event.source === "filesystem" ? "observed" : event.status;
  const lines = [
    event.filePath,
    `Source: ${event.source}`,
    `Status: ${event.status}`,
    `Action: ${event.action}`,
    `Agent: ${event.agentId}`,
    `Session: ${event.sessionId}`,
    ...(event.toolName === undefined ? [] : [`Tool: ${event.toolName}`]),
    `Time: ${formatTime(event.timestamp)}`,
  ];
  return {
    label: `${stage} ${event.action} ${nodePath.basename(event.filePath)}`,
    description: `${event.agentId}/${event.sessionId} · ${formatTime(event.timestamp)}`,
    tooltip: lines.join("\n"),
  };
}

export function describeOffer(event: AgentFileEvent): string {
  return `${event.agentId} is about to edit ${nodePath.basename(event.filePath)}.`;
}

export function describeSession(session: SessionInfo, formatTime: TimeFormatter): ItemDescription {
  const noun = session.eventCount === 1 ? "event" : "events";
  return {
    label: `${session.agentId} / ${session.sessionId}`,
    description: `${String(session.eventCount)} ${noun} · ${formatTime(session.lastSeen)}`,
    tooltip: `Last: ${session.lastStatus} ${session.lastAction} ${session.lastFilePath}`,
  };
}

export function describeStatus(enabled: boolean, paused: boolean): StatusDescription {
  if (!enabled) {
    return { text: "$(eye-closed) AgentLens: off", tooltip: "AgentLens is disabled. Run AgentLens: Enable to turn it on." };
  }
  if (paused) {
    return {
      text: "$(debug-pause) AgentLens: paused",
      tooltip: "Auto focus is paused. Events are still recorded. Run AgentLens: Resume Auto Focus.",
    };
  }
  return { text: "$(eye) AgentLens", tooltip: "AgentLens is recording agent file activity." };
}
