import { randomBytes } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, type Stats } from "node:fs";
import nodePath from "node:path";
import { secretFilePath, type SecretLocation } from "../transport/endpoint-secret";

export type DeployStatus = "created" | "updated" | "unchanged";

const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_DIRECTORY_MODE = 0o700;
const OTHERS_CAN_WRITE = 0o022;

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

function lstatOrUndefined(target: string): Stats | undefined {
  try {
    return lstatSync(target);
  } catch (error) {
    if (isMissing(error)) {
      return undefined;
    }
    throw error;
  }
}

function readOrUndefined(target: string): Buffer | undefined {
  try {
    return readFileSync(target);
  } catch (error) {
    if (isMissing(error)) {
      return undefined;
    }
    throw error;
  }
}

function belongsToAnotherUser(info: Stats): boolean {
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  return uid !== undefined && info.uid !== uid;
}

/** Claude Code runs this file on every edit, so whoever can replace it or its folder runs code as the user. */
function untrustedFolderReason(folder: string): string | undefined {
  const info = lstatOrUndefined(folder);
  if (info === undefined) {
    return undefined;
  }
  if (info.isSymbolicLink() || !info.isDirectory()) {
    return `${folder} is a link or not a folder`;
  }
  if (belongsToAnotherUser(info) || (process.platform !== "win32" && (info.mode & OTHERS_CAN_WRITE) !== 0)) {
    return `${folder} is owned by another user or writable by others`;
  }
  return undefined;
}

function untrustedFileReason(target: string): string | undefined {
  const info = lstatOrUndefined(target);
  if (info === undefined) {
    return undefined;
  }
  if (!info.isFile()) {
    return `${target} is not a regular file`;
  }
  if (belongsToAnotherUser(info) || (process.platform !== "win32" && (info.mode & OTHERS_CAN_WRITE) !== 0)) {
    return `${target} is owned by another user or writable by others`;
  }
  return undefined;
}

/**
 * Makes `target` an exact copy of the bundled hook script. The copy is written whole to a
 * temporary file and renamed into place, so a hook that starts during an update runs either the old
 * or the new script, never half of one. A folder or file that is a link, belongs to another user or
 * can be written by others is refused rather than written through, because Claude Code runs the
 * result.
 */
export function deployHookScript(source: string, target: string): DeployStatus {
  const content = readFileSync(source);
  const folder = nodePath.dirname(target);
  const reason = untrustedFolderReason(folder) ?? untrustedFileReason(target);
  if (reason !== undefined) {
    throw new Error(`hook script was not written because ${reason}; fix or delete it and reload the window`);
  }

  const existing = readOrUndefined(target);
  if (existing?.equals(content) === true) {
    return "unchanged";
  }

  mkdirSync(folder, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  const temporary = `${target}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    writeFileSync(temporary, content, { flag: "wx", mode: PRIVATE_FILE_MODE });
    try {
      renameSync(temporary, target);
    } catch (error) {
      // Another window starting at the same time may have put the same script there first, and
      // Windows then refuses the second rename. The goal is met, so that is not a failure.
      if (readOrUndefined(target)?.equals(content) === true) {
        return "unchanged";
      }
      throw error;
    }
  } finally {
    rmSync(temporary, { force: true });
  }
  return existing === undefined ? "created" : "updated";
}
