import nodePath from "node:path";
import type { AgentAction, AgentFileEvent } from "../models/agent-file-event";
import { isStrictlyInside, normalizeAbsolutePath, type PathApi } from "../utils/path-utils";

export type FilesystemChangeKind = "create" | "change" | "delete";

export const FILESYSTEM_AGENT_ID = "unknown";
export const FILESYSTEM_SESSION_ID = "filesystem";

const ACTION_BY_KIND: Readonly<Record<FilesystemChangeKind, AgentAction>> = {
  create: "create",
  change: "edit",
  delete: "delete",
};

export function createFilesystemEvent(
  kind: FilesystemChangeKind,
  filePath: string,
  timestamp: number,
  eventId: string,
): AgentFileEvent {
  return {
    eventId,
    agentId: FILESYSTEM_AGENT_ID,
    sessionId: FILESYSTEM_SESSION_ID,
    action: ACTION_BY_KIND[kind],
    status: "observed",
    filePath,
    timestamp,
    source: "filesystem",
  };
}

export function isIgnoredPath(
  filePath: string,
  workspaceRoots: readonly string[],
  ignoredFolders: readonly string[],
  pathApi: PathApi = nodePath,
): boolean {
  const normalizedFile = normalizeAbsolutePath(filePath, pathApi);
  if (normalizedFile === undefined) {
    return false;
  }
  const ignored = new Set(ignoredFolders);
  return workspaceRoots.some((root) => {
    const normalizedRoot = normalizeAbsolutePath(root, pathApi);
    if (normalizedRoot === undefined || !isStrictlyInside(normalizedFile, normalizedRoot, pathApi)) {
      return false;
    }
    return pathApi
      .relative(normalizedRoot, normalizedFile)
      .split(pathApi.sep)
      .some((segment) => ignored.has(segment));
  });
}
