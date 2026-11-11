import { describe, expect, it } from "vitest";
import { selectTabsToClose, type TabSnapshot } from "./tab-selection";

function tab(key: string | undefined, overrides: Partial<TabSnapshot> = {}): TabSnapshot {
  return { key, isActive: false, isDirty: false, isPinned: false, ...overrides };
}

function keysOf(tabs: readonly TabSnapshot[]): (string | undefined)[] {
  return tabs.map((entry) => entry.key);
}

function select(
  tabs: readonly TabSnapshot[],
  ownedKeys: readonly string[],
  options: { maxTabs?: number; protectedKeys?: readonly string[] } = {},
): TabSnapshot[] {
  return selectTabsToClose({
    tabs,
    ownedKeys,
    protectedKeys: new Set(options.protectedKeys ?? []),
    maxTabs: options.maxTabs ?? 2,
  });
}

describe("selectTabsToClose", () => {
  it("closes nothing at or below the limit", () => {
    const tabs = [tab("a"), tab("b")];
    expect(select(tabs, ["a", "b"], { maxTabs: 2 })).toEqual([]);
  });

  it("closes the oldest owned tabs down to the limit", () => {
    const tabs = [tab("a"), tab("b"), tab("c"), tab("d", { isActive: true })];
    expect(keysOf(select(tabs, ["b", "a", "c", "d"], { maxTabs: 2 }))).toEqual(["b", "a"]);
  });

  it("never closes a tab AgentLens did not open", () => {
    const tabs = [tab("user"), tab("a"), tab("b", { isActive: true })];
    expect(keysOf(select(tabs, ["a", "b"], { maxTabs: 1 }))).toEqual(["a"]);
  });

  it("never closes the active tab", () => {
    const tabs = [tab("a", { isActive: true }), tab("b")];
    expect(keysOf(select(tabs, ["a", "b"], { maxTabs: 1 }))).toEqual(["b"]);
  });

  it("never closes a pinned tab", () => {
    const tabs = [tab("a", { isPinned: true }), tab("b"), tab("c", { isActive: true })];
    expect(keysOf(select(tabs, ["a", "b", "c"], { maxTabs: 1 }))).toEqual(["b"]);
  });

  it("never closes a dirty tab", () => {
    const tabs = [tab("a", { isDirty: true }), tab("b"), tab("c", { isActive: true })];
    expect(keysOf(select(tabs, ["a", "b", "c"], { maxTabs: 1 }))).toEqual(["b"]);
  });

  it("never closes a file an agent is working on", () => {
    const tabs = [tab("a"), tab("b"), tab("c", { isActive: true })];
    expect(keysOf(select(tabs, ["a", "b", "c"], { maxTabs: 1, protectedKeys: ["a"] }))).toEqual(["b"]);
  });

  it("exceeds the limit when nothing is safe to close", () => {
    const tabs = [tab("a", { isPinned: true }), tab("b", { isDirty: true }), tab("c", { isActive: true }), tab("d")];
    expect(select(tabs, ["a", "b", "c"], { maxTabs: 1 })).toEqual([]);
  });

  it("closes fewer tabs than the excess when only some are safe", () => {
    const tabs = [tab("a"), tab("b", { isPinned: true }), tab("c", { isDirty: true }), tab("d", { isActive: true })];
    expect(keysOf(select(tabs, ["a", "b", "c", "d"], { maxTabs: 1 }))).toEqual(["a"]);
  });

  it("counts tabs that are not plain files toward the limit but never closes them", () => {
    const tabs = [tab(undefined), tab(undefined), tab("a"), tab("b", { isActive: true })];
    expect(keysOf(select(tabs, ["a", "b"], { maxTabs: 2 }))).toEqual(["a"]);
  });

  it("leaves a file alone when it is open in more than one tab", () => {
    const tabs = [tab("a"), tab("a"), tab("b", { isActive: true })];
    expect(select(tabs, ["a", "b"], { maxTabs: 1 })).toEqual([]);
  });

  it("ignores owned keys that have no tab", () => {
    const tabs = [tab("a"), tab("b", { isActive: true })];
    expect(keysOf(select(tabs, ["gone", "a"], { maxTabs: 1 }))).toEqual(["a"]);
  });

  it("selects a tab once even when its key is listed twice", () => {
    const tabs = [tab("a"), tab("b"), tab("c", { isActive: true })];
    expect(keysOf(select(tabs, ["a", "a", "b"], { maxTabs: 1 }))).toEqual(["a", "b"]);
  });

  it("treats a limit below one as one", () => {
    const tabs = [tab("a"), tab("b", { isActive: true })];
    expect(keysOf(select(tabs, ["a", "b"], { maxTabs: 0 }))).toEqual(["a"]);
  });

  it("returns the original tab objects", () => {
    const owned = { ...tab("a"), handle: 7 };
    const [selected] = selectTabsToClose({
      tabs: [owned, tab("b", { isActive: true })],
      ownedKeys: ["a"],
      protectedKeys: new Set<string>(),
      maxTabs: 1,
    });
    expect(selected).toBe(owned);
  });
});
