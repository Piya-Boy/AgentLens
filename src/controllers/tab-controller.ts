import { OwnedTabs } from "./owned-tabs";
import { selectTabsToClose, type TabSnapshot } from "./tab-selection";

export interface TabControllerOptions<T extends TabSnapshot> {
  readonly listTabs: () => readonly T[];
  readonly closeTabs: (tabs: readonly T[]) => Promise<void>;
  readonly getProtectedKeys: () => Promise<ReadonlySet<string>>;
  readonly getMaxTabs: () => number;
  readonly reportError: (error: unknown) => void;
}

/** Keeps the tab count near the limit by closing only tabs AgentLens opened and that are safe to close. */
export class TabController<T extends TabSnapshot> {
  private readonly owned = new OwnedTabs();
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly options: TabControllerOptions<T>) {}

  trackOpened(key: string): void {
    this.owned.markOpened(key);
  }

  /** Runs one pass at a time so two quick opens cannot close the same tab twice. */
  enforce(): Promise<void> {
    this.queue = this.queue.then(() => this.pass());
    return this.queue;
  }

  private async pass(): Promise<void> {
    try {
      const protectedKeys = await this.options.getProtectedKeys();
      // Listed after the only await so the snapshot is as fresh as possible when tabs are closed.
      const tabs = this.options.listTabs();
      this.owned.retainOnly(new Set(tabs.flatMap((tab) => (tab.key === undefined ? [] : [tab.key]))));
      const toClose = selectTabsToClose({
        tabs,
        ownedKeys: this.owned.list(),
        protectedKeys,
        maxTabs: this.options.getMaxTabs(),
      });
      if (toClose.length > 0) {
        await this.options.closeTabs(toClose);
      }
    } catch (error) {
      this.options.reportError(error);
    }
  }
}
