import type { AgentFileEvent } from "../models/agent-file-event";

export type AdapterParseResult =
  | { readonly ok: true; readonly event: AgentFileEvent }
  | { readonly ok: false; readonly reason: "unsupported" | "malformed"; readonly detail: string };

export type AdapterRunResult =
  | AdapterParseResult
  | { readonly ok: false; readonly reason: "failed"; readonly detail: string };

/**
 * Turns one agent-specific payload into the shared event. An adapter is a pure translator:
 * it never touches the file system or VS Code, and it must not copy file content or other
 * user data into the event. Receiving payloads (hook, socket, file) is the transport's job,
 * so a new agent needs a parser here plus whatever transport that agent offers.
 */
export interface AgentAdapter {
  readonly id: string;
  parse(payload: unknown, now: number): AdapterParseResult;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isParseResult(value: unknown): value is AdapterParseResult {
  return typeof value === "object" && value !== null && typeof (value as { ok?: unknown }).ok === "boolean";
}

/**
 * Runs an adapter so that a bug or an unexpected payload in one adapter becomes a reported
 * failure instead of an exception that reaches the transport or other adapters.
 */
export function runAdapter(adapter: AgentAdapter, payload: unknown, now: number): AdapterRunResult {
  try {
    const result: unknown = adapter.parse(payload, now);
    if (!isParseResult(result)) {
      return { ok: false, reason: "failed", detail: `adapter ${adapter.id} returned an invalid result` };
    }
    return result;
  } catch (error) {
    return { ok: false, reason: "failed", detail: `adapter ${adapter.id} threw: ${describeError(error)}` };
  }
}
