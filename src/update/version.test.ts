import { describe, expect, it } from "vitest";
import { compareVersions, formatVersion, parseVersion } from "./version";

describe("parseVersion", () => {
  it("reads major.minor.patch with or without a leading v", () => {
    expect(parseVersion("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseVersion("v10.0.21")).toEqual({ major: 10, minor: 0, patch: 21 });
  });

  it.each(["", "1.2", "1.2.3.4", "1.2.3-beta.1", "v1.2.3+build", "latest", "1.2.x", " 1.2.3", "1.2.3\n", "-1.2.3", "1234567.0.0"])(
    "does not accept %j",
    (text) => {
      expect(parseVersion(text)).toBeUndefined();
    },
  );
});

describe("compareVersions", () => {
  const v = (text: string) => {
    const parsed = parseVersion(text);
    if (parsed === undefined) {
      throw new Error(text);
    }
    return parsed;
  };

  it("orders by major, then minor, then patch", () => {
    expect(compareVersions(v("2.0.0"), v("1.9.9"))).toBeGreaterThan(0);
    expect(compareVersions(v("1.3.0"), v("1.2.9"))).toBeGreaterThan(0);
    expect(compareVersions(v("1.2.4"), v("1.2.3"))).toBeGreaterThan(0);
    expect(compareVersions(v("1.2.3"), v("1.2.4"))).toBeLessThan(0);
    expect(compareVersions(v("1.2.3"), v("1.2.3"))).toBe(0);
  });

  it("compares numbers, not text", () => {
    expect(compareVersions(v("1.10.0"), v("1.9.0"))).toBeGreaterThan(0);
  });
});

describe("formatVersion", () => {
  it("drops the leading v and any padding", () => {
    expect(formatVersion({ major: 0, minor: 1, patch: 12 })).toBe("0.1.12");
  });
});
