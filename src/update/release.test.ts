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
    ["a draft", { ...valid, draft: true }],
    ["a pre-release", { ...valid, prerelease: true }],
    ["a tag that is not a plain version", { ...valid, tag_name: "v1.4.0-rc.1" }],
    ["a missing tag", { ...valid, tag_name: undefined }],
    ["a numeric tag", { ...valid, tag_name: 140 }],
    ["a page on another host", { ...valid, html_url: "https://example.invalid/Piya-Boy/AgentLens/releases/tag/v1.4.0" }],
    ["a page on another repository", { ...valid, html_url: "https://github.com/someone/else/releases/tag/v1.4.0" }],
    ["a look-alike prefix", { ...valid, html_url: "https://github.com/Piya-Boy/AgentLens/releases-evil/tag/v1.4.0" }],
    ["a plain http page", { ...valid, html_url: "http://github.com/Piya-Boy/AgentLens/releases/tag/v1.4.0" }],
    ["a page with whitespace", { ...valid, html_url: `${RELEASE_PAGE_PREFIX}tag/v1 .4.0` }],
    ["a page with a quote", { ...valid, html_url: `${RELEASE_PAGE_PREFIX}tag/"x` }],
    ["a missing page", { ...valid, html_url: undefined }],
  ])("rejects %s", (_label, body) => {
    expect(parseLatestRelease(body)).toBeUndefined();
  });

  it.each([null, undefined, "text", 42, [], [valid]])("rejects %j", (body) => {
    expect(parseLatestRelease(body)).toBeUndefined();
  });
});
