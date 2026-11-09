import { randomBytes } from "node:crypto";
import { linkSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import nodePath from "node:path";

export interface SecretLocation {
  readonly platform: NodeJS.Platform;
  readonly homeDir: string;
  readonly localAppData?: string | undefined;
  readonly xdgStateHome?: string | undefined;
}

const SECRET_PATTERN = /^[0-9a-f]{64}$/;
const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MODE = 0o700;

type Inspection =
  | { readonly status: "ok"; readonly secret: string }
  | { readonly status: "missing" }
  | { readonly status: "unusable"; readonly reason: string };

/** Per-user location, outside the workspace and outside shared temp folders. */
export function secretFilePath(location: SecretLocation): string {
  const base =
    location.platform === "win32"
      ? (location.localAppData ?? nodePath.join(location.homeDir, "AppData", "Local"))
      : (location.xdgStateHome ?? nodePath.join(location.homeDir, ".local", "state"));
  return nodePath.join(base, "agentlens", "endpoint-secret");
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function isExisting(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "EEXIST";
}

function inspect(file: string): Inspection {
  let info: ReturnType<typeof lstatSync>;
  try {
    info = lstatSync(file);
  } catch (error) {
    if (isMissing(error)) {
      return { status: "missing" };
    }
    throw error;
  }
  if (!info.isFile()) {
    return { status: "unusable", reason: "it is not a regular file" };
  }
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (uid !== undefined && (info.uid !== uid || (info.mode & 0o077) !== 0)) {
    return { status: "unusable", reason: "it is owned by another user or readable by others" };
  }
  const text = readFileSync(file, "utf8").trim();
  return SECRET_PATTERN.test(text) ? { status: "ok", secret: text } : { status: "unusable", reason: "its content is malformed" };
}

/** For the hook: the secret when a usable one exists, otherwise undefined. Never creates anything. */
export function readSecret(file: string): string | undefined {
  try {
    const result = inspect(file);
    return result.status === "ok" ? result.secret : undefined;
  } catch {
    return undefined;
  }
}

/**
 * For the extension: returns the secret, creating it on first use. Creation writes a complete
 * temporary file and hard-links it into place, so two windows starting together end up with the
 * same secret and nobody ever reads a half-written one.
 */
export function loadOrCreateSecret(file: string): string {
  const existing = inspect(file);
  if (existing.status === "ok") {
    return existing.secret;
  }
  if (existing.status === "unusable") {
    throw new Error(`endpoint secret ${file} is unusable because ${existing.reason}; delete it and reload the window`);
  }

  mkdirSync(nodePath.dirname(file), { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  const temporary = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    writeFileSync(temporary, `${randomBytes(32).toString("hex")}\n`, { flag: "wx", mode: PRIVATE_FILE_MODE });
    try {
      linkSync(temporary, file);
    } catch (error) {
      if (!isExisting(error)) {
        throw error;
      }
    }
  } finally {
    rmSync(temporary, { force: true });
  }

  const created = inspect(file);
  if (created.status !== "ok") {
    throw new Error(`endpoint secret ${file} could not be created`);
  }
  return created.secret;
}
