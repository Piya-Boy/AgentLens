import { describe, expect, it } from "vitest";
import { OwnedTabs } from "./owned-tabs";

describe("OwnedTabs", () => {
  it("lists keys oldest first", () => {
    const owned = new OwnedTabs();
    owned.markOpened("a");
    owned.markOpened("b");
    expect(owned.list()).toEqual(["a", "b"]);
  });

  it("moves a key to the end when it is opened again", () => {
    const owned = new OwnedTabs();
    owned.markOpened("a");
    owned.markOpened("b");
    owned.markOpened("a");
    expect(owned.list()).toEqual(["b", "a"]);
  });

  it("forgets a tab that was seen and then disappeared", () => {
    const owned = new OwnedTabs();
    owned.markOpened("a");
    owned.markOpened("b");
    owned.retainOnly(new Set(["a", "b"]));
    owned.retainOnly(new Set(["b", "other"]));
    expect(owned.list()).toEqual(["b"]);
  });

  it("keeps a tab that has not appeared in any list yet", () => {
    const owned = new OwnedTabs();
    owned.markOpened("a");
    owned.retainOnly(new Set());
    owned.retainOnly(new Set());
    expect(owned.list()).toEqual(["a"]);
  });

  it("treats a reopened file as unseen again", () => {
    const owned = new OwnedTabs();
    owned.markOpened("a");
    owned.retainOnly(new Set(["a"]));
    owned.markOpened("a");
    owned.retainOnly(new Set());
    expect(owned.list()).toEqual(["a"]);
  });
});
