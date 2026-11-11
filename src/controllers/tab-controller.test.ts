import { describe, expect, it, vi } from "vitest";
import { TabController } from "./tab-controller";
import type { TabSnapshot } from "./tab-selection";

interface FakeTab extends TabSnapshot {
  readonly id: string;
}

function tab(id: string, overrides: Partial<TabSnapshot> = {}): FakeTab {
  return { id, key: id, isActive: false, isDirty: false, isPinned: false, ...overrides };
}

interface ControllerSetup {
  tabs: FakeTab[];
  maxTabs?: number;
  protectedKeys?: string[];
  closeTabs?: (tabs: readonly FakeTab[]) => Promise<void>;
  getProtectedKeys?: () => Promise<ReadonlySet<string>>;
}

function createController(setup: ControllerSetup) {
  const closed: string[] = [];
  const closeTabs = vi.fn(
    setup.closeTabs ??
      ((tabs: readonly FakeTab[]) => {
        for (const entry of tabs) {
          closed.push(entry.id);
          setup.tabs.splice(setup.tabs.indexOf(entry), 1);
        }
        return Promise.resolve();
      }),
  );
  const reportError = vi.fn();
  const controller = new TabController<FakeTab>({
    listTabs: () => setup.tabs,
    closeTabs,
    getProtectedKeys: setup.getProtectedKeys ?? (() => Promise.resolve(new Set(setup.protectedKeys ?? []))),
    getMaxTabs: () => setup.maxTabs ?? 2,
    reportError,
  });
  return { controller, closed, closeTabs, reportError };
}

describe("TabController", () => {
  it("closes the oldest tab AgentLens opened when over the limit", async () => {
    const { controller, closed } = createController({
      tabs: [tab("a"), tab("b"), tab("c", { isActive: true })],
      maxTabs: 2,
    });
    controller.trackOpened("a");
    controller.trackOpened("b");
    controller.trackOpened("c");

    await controller.enforce();

    expect(closed).toEqual(["a"]);
  });

  it("closes nothing that was not tracked as opened by AgentLens", async () => {
    const { controller, closeTabs } = createController({
      tabs: [tab("a"), tab("b"), tab("c", { isActive: true })],
      maxTabs: 1,
    });

    await controller.enforce();

    expect(closeTabs).not.toHaveBeenCalled();
  });

  it("forgets a tab the user closed so a reopened file is not treated as ours", async () => {
    const tabs = [tab("a"), tab("b", { isActive: true })];
    const setup: ControllerSetup = { tabs, maxTabs: 5 };
    const { controller, closeTabs } = createController(setup);
    controller.trackOpened("a");
    await controller.enforce();
    tabs.splice(0, 1);
    await controller.enforce();

    tabs.unshift(tab("a"));
    setup.maxTabs = 1;
    await controller.enforce();

    expect(closeTabs).not.toHaveBeenCalled();
  });

  it("still trims a tab that was missing from the list right after it was opened", async () => {
    const tabs = [tab("b", { isActive: true })];
    const { controller, closed } = createController({ tabs, maxTabs: 1 });
    controller.trackOpened("a");
    await controller.enforce();

    tabs.unshift(tab("a"));
    await controller.enforce();

    expect(closed).toEqual(["a"]);
  });

  it("keeps a file an agent is working on", async () => {
    const { controller, closed } = createController({
      tabs: [tab("a"), tab("b"), tab("c", { isActive: true })],
      maxTabs: 1,
      protectedKeys: ["a"],
    });
    controller.trackOpened("a");
    controller.trackOpened("b");

    await controller.enforce();

    expect(closed).toEqual(["b"]);
  });

  it("reports a close failure instead of throwing and keeps working afterwards", async () => {
    const failure = new Error("close failed");
    let fail = true;
    const { controller, closeTabs, reportError } = createController({
      tabs: [tab("a"), tab("b", { isActive: true })],
      maxTabs: 1,
      closeTabs: () => (fail ? Promise.reject(failure) : Promise.resolve()),
    });
    controller.trackOpened("a");

    await controller.enforce();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(failure);

    fail = false;
    await controller.enforce();
    expect(closeTabs).toHaveBeenCalledTimes(2);
  });

  it("closes nothing when the protected files cannot be determined", async () => {
    const failure = new Error("no sessions");
    const { controller, closeTabs, reportError } = createController({
      tabs: [tab("a"), tab("b", { isActive: true })],
      maxTabs: 1,
      getProtectedKeys: () => Promise.reject(failure),
    });
    controller.trackOpened("a");

    await controller.enforce();

    expect(closeTabs).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledExactlyOnceWith(failure);
  });

  it("runs overlapping passes one after another so a tab is closed once", async () => {
    const { controller, closed } = createController({
      tabs: [tab("a"), tab("b", { isActive: true })],
      maxTabs: 1,
    });
    controller.trackOpened("a");

    await Promise.all([controller.enforce(), controller.enforce(), controller.enforce()]);

    expect(closed).toEqual(["a"]);
  });
});
