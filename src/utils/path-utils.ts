import nodePath from "node:path";

export type PathApi = nodePath.PlatformPath;

export function normalizeAbsolutePath(input: string, pathApi: PathApi = nodePath): string | undefined {
  if (input.includes("\0") || !pathApi.isAbsolute(input)) {
    return undefined;
  }
  const normalized = pathApi.normalize(input);
  const { root } = pathApi.parse(normalized);
  let end = normalized.length;
  while (end > root.length && normalized.charAt(end - 1) === pathApi.sep) {
    end -= 1;
  }
  return normalized.slice(0, end);
}

export function isStrictlyInside(filePath: string, rootPath: string, pathApi: PathApi = nodePath): boolean {
  const relative = pathApi.relative(rootPath, filePath);
  if (relative === "" || pathApi.isAbsolute(relative)) {
    return false;
  }
  return relative !== ".." && !relative.startsWith(`..${pathApi.sep}`);
}
