import { describe, expect, it } from "vitest";
import { parseLatestRelease, RELEASE_PAGE_PREFIX } from "./release";

const valid = {
  tag_name: "v1.4.0",
  html_url: `${RELEASE_PAGE_PREFIX}tag/v1.4.0`,
  draft: false,
  prerelease: false,
  body: "ignored release notes",
  assets: [{ browser_download_url: "https://example.invalid/evil.vsix" }],
};

describe("parseLatestRelease", () => {
  it("returns only the version and the release page", () => {
    expect(parseLatestRelease(valid)).toEqual({
      version: { major: 1, minor: 4, patch: 0 },
      label: "1.4.0",
      url: `${RELEASE_PAGE_PREFIX}tag/v1.4.0`,
    });
  });

  it("never exposes download links from the response", () => {
    expect(JSON.stringify(parseLatestRelease(valid))).not.toContain("evil");
  });

  it.each([
    "https://example.invalid/phish",
    `${RELEASE_PAGE_PREFIX}../../../anything`,
    "javascript:alert(1)",
    undefined,
    42,
  ])("builds the page from the tag and ignores the response's own page %j", (htmlUrl) => {
    expect(parseLatestRelease({ ...valid, html_url: htmlUrl })?.url).toBe(`${RELEASE_PAGE_PREFIX}tag/v1.4.0`);
  });

  it("keeps the tag spelling it was given, with or without a leading v", () => {
    expect(parseLatestRelease({ ...valid, tag_name: "1.4.0" })?.url).toBe(`${RELEASE_PAGE_PREFIX}tag/1.4.0`);
  });

  it.each([
    ["a draft", { ...valid, draft: true }],
    ["a pre-release", { ...valid, prerelease: true }],
    ["a tag that is not a plain version", { ...valid, tag_name: "v1.4.0-rc.1" }],
    ["a tag that tries to leave the releases folder", { ...valid, tag_name: "../../x" }],
    ["a tag with a path after the version", { ...valid, tag_name: "v1.4.0/../../x" }],
    ["a missing tag", { ...valid, tag_name: undefined }],
    ["a numeric tag", { ...valid, tag_name: 140 }],
  ])("rejects %s", (_label, body) => {
    expect(parseLatestRelease(body)).toBeUndefined();
  });

  it.each([null, undefined, "text", 42, [], [valid]])("rejects %j", (body) => {
    expect(parseLatestRelease(body)).toBeUndefined();
  });
});
