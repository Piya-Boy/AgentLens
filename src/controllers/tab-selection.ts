export interface TabSnapshot {
  /** Path key of a plain file tab; undefined for every other kind of tab. */
  readonly key: string | undefined;
  readonly isActive: boolean;
  readonly isDirty: boolean;
  readonly isPinned: boolean;
}

export interface TabSelectionInput<T extends TabSnapshot> {
  readonly tabs: readonly T[];
  /** Keys of tabs AgentLens opened, oldest first. Only these may ever be closed. */
  readonly ownedKeys: readonly string[];
  /** Keys of files an agent session is working on. */
  readonly protectedKeys: ReadonlySet<string>;
  readonly maxTabs: number;
}

/**
 * Picks the tabs to close to get back to the limit, oldest first. The limit is a target:
 * when too few tabs are safe to close, fewer are returned and the limit is exceeded.
 */
export function selectTabsToClose<T extends TabSnapshot>(input: TabSelectionInput<T>): T[] {
  const excess = input.tabs.length - Math.max(1, Math.floor(input.maxTabs));
  if (excess <= 0) {
    return [];
  }

  const tabsPerKey = new Map<string, number>();
  for (const tab of input.tabs) {
    if (tab.key !== undefined) {
      tabsPerKey.set(tab.key, (tabsPerKey.get(tab.key) ?? 0) + 1);
    }
  }

  const closable = new Map<string, T>();
  for (const tab of input.tabs) {
    const { key } = tab;
    const isSafe = !tab.isActive && !tab.isDirty && !tab.isPinned;
    if (key !== undefined && isSafe && !input.protectedKeys.has(key) && tabsPerKey.get(key) === 1) {
      closable.set(key, tab);
    }
  }

  const selected: T[] = [];
  for (const key of input.ownedKeys) {
    const tab = closable.get(key);
    if (tab !== undefined && selected.length < excess) {
      selected.push(tab);
      closable.delete(key);
    }
  }
  return selected;
}
