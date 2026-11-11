import { createHmac } from "node:crypto";
import nodePath from "node:path";
import type { PathApi } from "../utils/path-utils";

export interface EndpointEnvironment {
  readonly platform: NodeJS.Platform;
  readonly runtimeDir: string;
  readonly uid: number;
  /** Per-user secret that keeps other local users from computing, and so squatting, an endpoint name. */
  readonly secret: string;
}

export const SOCKET_DIR_PREFIX = "agentlens-";

function rootKey(realRootPath: string, environment: EndpointEnvironment): string {
  const normalized = environment.platform === "win32" ? realRootPath.toLowerCase() : realRootPath;
  return createHmac("sha256", environment.secret).update(normalized).digest("hex").slice(0, 16);
}

export function socketDirectory(environment: EndpointEnvironment): string {
  return nodePath.join(environment.runtimeDir, `${SOCKET_DIR_PREFIX}${String(environment.uid)}`);
}

/** Local IPC endpoint for a workspace root, derived from its real path so the hook and the extension agree. */
export function endpointForRoot(realRootPath: string, environment: EndpointEnvironment): string {
  const key = rootKey(realRootPath, environment);
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
