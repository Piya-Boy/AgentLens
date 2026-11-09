import nodePath from "node:path";

/** Comparable form of a path: normalized, and case-folded where the file system usually is. */
export function pathKey(filePath: string, platform: NodeJS.Platform = process.platform): string {
  const normalized = nodePath.normalize(filePath);
  return platform === "win32" || platform === "darwin" ? normalized.toLowerCase() : normalized;
}
