import { randomBytes } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import nodePath from "node:path";
import { secretFilePath, type SecretLocation } from "../transport/endpoint-secret";

export type DeployStatus = "created" | "updated" | "unchanged";

const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MODE = 0o700;

/**
 * Where Claude Code is told to find the hook. It sits beside the endpoint secret, so it does not
 * change when VS Code installs a new version of the extension into a new folder.
 */
export function stableHookPath(location: SecretLocation): string {
  return nodePath.join(nodePath.dirname(secretFilePath(location)), "hook.js");
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

/** The reason the target must not be replaced or run, or undefined when it is absent or ours. */
function unusableReason(target: string): string | undefined {
  let info: ReturnType<typeof lstatSync>;
  try {
    info = lstatSync(target);
  } catch (error) {
    if (isMissing(error)) {
      return undefined;
    }
    throw error;
  }
  if (!info.isFile()) {
    return "it is not a regular file";
  }
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (uid !== undefined && (info.uid !== uid || (info.mode & 0o022) !== 0)) {
    return "it is owned by another user or writable by others";
  }
  return undefined;
}

/**
 * Makes `target` an exact copy of the bundled hook script. The copy is written whole to a
 * temporary file and renamed into place, so a hook that starts during an update runs either the old
 * or the new script, never half of one. A target that is a link, a folder or another user's file is
 * refused rather than written through.
 */
export function deployHookScript(source: string, target: string): DeployStatus {
  const content = readFileSync(source);
  const reason = unusableReason(target);
  if (reason !== undefined) {
    throw new Error(`hook script ${target} was not replaced because ${reason}; delete it and reload the window`);
  }

  let existing: Buffer | undefined;
  try {
    existing = readFileSync(target);
  } catch (error) {
    if (!isMissing(error)) {
      throw error;
    }
  }
  if (existing?.equals(content) === true) {
    return "unchanged";
  }

  mkdirSync(nodePath.dirname(target), { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  const temporary = `${target}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    writeFileSync(temporary, content, { flag: "wx", mode: PRIVATE_FILE_MODE });
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
  return existing === undefined ? "created" : "updated";
}
