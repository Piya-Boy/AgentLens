import { createHash } from "node:crypto";
import nodePath from "node:path";
import type { PathApi } from "../utils/path-utils";

export interface EndpointEnvironment {
  readonly platform: NodeJS.Platform;
  readonly runtimeDir: string;
  readonly uid: number;
}

export const SOCKET_DIR_PREFIX = "agentlens-";

function rootKey(realRootPath: string, platform: NodeJS.Platform): string {
  const normalized = platform === "win32" ? realRootPath.toLowerCase() : realRootPath;
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

export function socketDirectory(environment: EndpointEnvironment): string {
  return nodePath.join(environment.runtimeDir, `${SOCKET_DIR_PREFIX}${String(environment.uid)}`);
}

/** Local IPC endpoint for a workspace root, derived from its real path so the hook and the extension agree. */
export function endpointForRoot(realRootPath: string, environment: EndpointEnvironment): string {
  const key = rootKey(realRootPath, environment.platform);
  if (environment.platform === "win32") {
    return `\\\\.\\pipe\\agentlens-${key}`;
  }
  return nodePath.join(socketDirectory(environment), `${key}.sock`);
}

/** The directory itself and each ancestor, deepest first. */
export function directoryChain(realDirectory: string, pathApi: PathApi = nodePath): string[] {
  const chain: string[] = [];
  let current = realDirectory;
  for (;;) {
    chain.push(current);
    const parent = pathApi.dirname(current);
    if (parent === current) {
      return chain;
    }
    current = parent;
  }
}
