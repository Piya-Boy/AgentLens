import { formatVersion, parseVersion, type Version } from "./version";

export const LATEST_RELEASE_API = "https://api.github.com/repos/Piya-Boy/AgentLens/releases/latest";
export const RELEASE_PAGE_PREFIX = "https://github.com/Piya-Boy/AgentLens/releases/";

export interface LatestRelease {
  readonly version: Version;
  readonly label: string;
  /** Always under `RELEASE_PAGE_PREFIX`, so it is safe to open in a browser. */
  readonly url: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads only the tag and page of a GitHub "latest release" response. Drafts, pre-releases, tags
 * that are not plain versions and pages outside this project's releases are rejected, because the
 * response comes from the network and its URL is later opened.
 */
export function parseLatestRelease(body: unknown): LatestRelease | undefined {
  if (!isRecord(body) || body.draft === true || body.prerelease === true) {
    return undefined;
  }
  const { tag_name: tag, html_url: url } = body;
  if (typeof tag !== "string" || typeof url !== "string") {
    return undefined;
  }
  const version = parseVersion(tag);
  if (version === undefined || !url.startsWith(RELEASE_PAGE_PREFIX) || /[\s"<>]/.test(url)) {
    return undefined;
  }
  return { version, label: formatVersion(version), url };
}
