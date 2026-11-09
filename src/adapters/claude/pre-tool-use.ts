import type { AgentAction } from "../../models/agent-file-event";
import type { AdapterParseResult, AgentAdapter } from "../adapter";

export const CLAUDE_AGENT_ID = "claude-code";

/**
 * Claude Code tools whose PreToolUse payload carries `tool_input.file_path`, per
 * https://code.claude.com/docs/en/hooks. Write cannot be told apart from an overwrite
 * before it runs, so it is reported as an edit. MultiEdit and NotebookEdit have no
 * documented tool_input schema and are deliberately unsupported.
 */
const ACTION_BY_TOOL: Readonly<Record<string, AgentAction>> = {
  Edit: "edit",
  Write: "edit",
  Read: "read",
};

export type ClaudePreToolUseResult = AdapterParseResult;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function parseClaudePreToolUse(payload: unknown, now: number): ClaudePreToolUseResult {
  if (!isRecord(payload)) {
    return { ok: false, reason: "malformed", detail: "payload must be an object" };
  }
  if (payload.hook_event_name !== "PreToolUse") {
    return { ok: false, reason: "unsupported", detail: "hook_event_name is not PreToolUse" };
  }

  const toolName = payload.tool_name;
  if (!nonEmptyString(toolName)) {
    return { ok: false, reason: "malformed", detail: "tool_name must be a non-empty string" };
  }
  const action = Object.hasOwn(ACTION_BY_TOOL, toolName) ? ACTION_BY_TOOL[toolName] : undefined;
  if (action === undefined) {
    return { ok: false, reason: "unsupported", detail: `tool ${toolName} is not a supported file tool` };
  }

  const { session_id: sessionId, tool_use_id: toolUseId, tool_input: toolInput } = payload;
  if (!nonEmptyString(sessionId)) {
    return { ok: false, reason: "malformed", detail: "session_id must be a non-empty string" };
  }
  if (!nonEmptyString(toolUseId)) {
    return { ok: false, reason: "malformed", detail: "tool_use_id must be a non-empty string" };
  }
  if (!isRecord(toolInput) || !nonEmptyString(toolInput.file_path)) {
    return { ok: false, reason: "malformed", detail: "tool_input.file_path must be a non-empty string" };
  }

  return {
    ok: true,
    event: {
      eventId: toolUseId,
      agentId: CLAUDE_AGENT_ID,
      sessionId,
      action,
      status: "started",
      filePath: toolInput.file_path,
      timestamp: now,
      toolName,
      source: "adapter",
    },
  };
}

export const claudeCodeAdapter: AgentAdapter = { id: CLAUDE_AGENT_ID, parse: parseClaudePreToolUse };
