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

  it("forgets keys that have no live tab", () => {
    const owned = new OwnedTabs();
    owned.markOpened("a");
    owned.markOpened("b");
    owned.retainOnly(new Set(["b", "other"]));
    expect(owned.list()).toEqual(["b"]);
  });
});
