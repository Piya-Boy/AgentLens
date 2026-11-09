import { realpath } from "node:fs/promises";
import nodePath from "node:path";
import { isStrictlyInside, type PathApi } from "./path-utils";

export class PathEscapeError extends Error {
  constructor() {
    super("resolved path is outside the workspace");
    this.name = "PathEscapeError";
  }
}

/**
 * Resolves symlinks and returns the real path of an existing file, but only when it lies
 * inside one of the workspace roots (also resolved). Rejects with the underlying fs error
 * when the file does not exist, and with PathEscapeError when it resolves outside.
 */
export async function resolveWithinWorkspace(
  filePath: string,
  workspaceRoots: readonly string[],
  pathApi: PathApi = nodePath,
): Promise<string> {
  const realFile = await realpath(filePath);
  const rootResults = await Promise.allSettled(workspaceRoots.map((root) => realpath(root)));
  const inside = rootResults.some(
    (result) => result.status === "fulfilled" && isStrictlyInside(realFile, result.value, pathApi),
  );
  if (!inside) {
    throw new PathEscapeError();
  }
  return realFile;
}
