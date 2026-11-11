import { formatVersion, parseVersion, type Version } from "./version";

export const LATEST_RELEASE_API = "https://api.github.com/repos/Piya-Boy/AgentLens/releases/latest";
export const RELEASE_PAGE_PREFIX = "https://github.com/Piya-Boy/AgentLens/releases/";

export interface LatestRelease {
  readonly version: Version;
  readonly label: string;
  /** Built from the tag, never taken from the response, so it is safe to open in a browser. */
  readonly url: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads only the tag of a GitHub "latest release" response. Drafts, pre-releases and tags that are
 * not plain versions are rejected. The page link is built here from the validated tag and the
 * response's own URLs are ignored, because the response comes from the network and the link is
 * later opened.
 */
export function parseLatestRelease(body: unknown): LatestRelease | undefined {
  if (!isRecord(body) || body.draft === true || body.prerelease === true) {
    return undefined;
  }
  const tag = body.tag_name;
  if (typeof tag !== "string") {
    return undefined;
  }
  const version = parseVersion(tag);
  if (version === undefined) {
    return undefined;
  }
  return { version, label: formatVersion(version), url: `${RELEASE_PAGE_PREFIX}tag/${tag}` };
}
