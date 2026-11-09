export const MAX_FORWARD_BYTES = 16 * 1024;

export interface ForwardMessage {
  readonly hook_event_name: string;
  readonly session_id: string;
  readonly tool_use_id: string;
  readonly tool_name: string;
  readonly cwd: string;
  readonly tool_input: { readonly file_path: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reduces a Claude Code hook payload to the fields AgentLens needs. File contents such as
 * `content`, `old_string` and `new_string` are dropped here so they never leave the hook process.
 */
export function buildForwardMessage(stdinText: string): ForwardMessage | undefined {
  let payload: unknown;
  try {
    payload = JSON.parse(stdinText);
  } catch {
    return undefined;
  }
  if (!isRecord(payload) || !isRecord(payload.tool_input)) {
    return undefined;
  }
  const { hook_event_name: hookEventName, session_id: sessionId, tool_use_id: toolUseId, tool_name: toolName, cwd } =
    payload;
  const filePath = payload.tool_input.file_path;
  if (
    typeof hookEventName !== "string" ||
    typeof sessionId !== "string" ||
    typeof toolUseId !== "string" ||
    typeof toolName !== "string" ||
    typeof cwd !== "string" ||
    typeof filePath !== "string"
  ) {
    return undefined;
  }
  const message: ForwardMessage = {
    hook_event_name: hookEventName,
    session_id: sessionId,
    tool_use_id: toolUseId,
    tool_name: toolName,
    cwd,
    tool_input: { file_path: filePath },
  };
  return Buffer.byteLength(JSON.stringify(message)) <= MAX_FORWARD_BYTES ? message : undefined;
}
