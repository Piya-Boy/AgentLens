import nodePath from "node:path";
import {
  AGENT_ACTIONS,
  AGENT_EVENT_SOURCES,
  AGENT_EVENT_STATUSES,
  type AgentFileEvent,
} from "../models/agent-file-event";
import { isStrictlyInside, normalizeAbsolutePath, type PathApi } from "../utils/path-utils";

export const MAX_ID_LENGTH = 256;
export const MAX_PATH_LENGTH = 4096;

export interface ValidationContext {
  readonly workspaceRoots: readonly string[];
  readonly pathApi?: PathApi;
}

export type ValidationResult =
  | { readonly ok: true; readonly event: AgentFileEvent }
  | { readonly ok: false; readonly errors: readonly string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

function readBoundedString(
  record: Record<string, unknown>,
  field: string,
  maxLength: number,
  errors: string[],
): string | undefined {
  const value = record[field];
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${field} must be a non-empty string`);
    return undefined;
  }
  if (value.length > maxLength) {
    errors.push(`${field} exceeds ${String(maxLength)} characters`);
    return undefined;
  }
  return value;
}

export function validateAgentFileEvent(input: unknown, context: ValidationContext): ValidationResult {
  if (!isRecord(input)) {
    return { ok: false, errors: ["event must be an object"] };
  }

  const pathApi = context.pathApi ?? nodePath;
  const errors: string[] = [];

  const eventId = readBoundedString(input, "eventId", MAX_ID_LENGTH, errors);
  const agentId = readBoundedString(input, "agentId", MAX_ID_LENGTH, errors);
  const sessionId = readBoundedString(input, "sessionId", MAX_ID_LENGTH, errors);
  const rawPath = readBoundedString(input, "filePath", MAX_PATH_LENGTH, errors);

  const { action, status, source, timestamp } = input;
  if (!oneOf(AGENT_ACTIONS, action)) {
    errors.push(`action must be one of: ${AGENT_ACTIONS.join(", ")}`);
  }
  if (!oneOf(AGENT_EVENT_STATUSES, status)) {
    errors.push(`status must be one of: ${AGENT_EVENT_STATUSES.join(", ")}`);
  }
  if (!oneOf(AGENT_EVENT_SOURCES, source)) {
    errors.push(`source must be one of: ${AGENT_EVENT_SOURCES.join(", ")}`);
  }
  if (typeof timestamp !== "number" || !Number.isSafeInteger(timestamp) || timestamp <= 0) {
    errors.push("timestamp must be a positive integer");
  }

  let toolName: string | undefined;
  if (input.toolName !== undefined) {
    toolName = readBoundedString(input, "toolName", MAX_ID_LENGTH, errors);
  }

  if (source === "filesystem" && status !== "observed") {
    errors.push("filesystem events must have status observed");
  }

  let filePath: string | undefined;
  if (rawPath !== undefined) {
    filePath = normalizeAbsolutePath(rawPath, pathApi);
    if (filePath === undefined) {
      errors.push("filePath must be an absolute path without NUL characters");
    } else {
      const resolved = filePath;
      const inside = context.workspaceRoots.some((root) => {
        const normalizedRoot = normalizeAbsolutePath(root, pathApi);
        return normalizedRoot !== undefined && isStrictlyInside(resolved, normalizedRoot, pathApi);
      });
      if (!inside) {
        errors.push("filePath is outside the workspace");
      }
    }
  }

  if (
    errors.length > 0 ||
    eventId === undefined ||
    agentId === undefined ||
    sessionId === undefined ||
    filePath === undefined ||
    !oneOf(AGENT_ACTIONS, action) ||
    !oneOf(AGENT_EVENT_STATUSES, status) ||
    !oneOf(AGENT_EVENT_SOURCES, source) ||
    typeof timestamp !== "number"
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    event: {
      eventId,
      agentId,
      sessionId,
      action,
      status,
      filePath,
      timestamp,
      source,
      ...(toolName === undefined ? {} : { toolName }),
    },
  };
}
