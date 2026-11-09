/** Remembers which file tabs AgentLens opened, in the order it opened them. */
export class OwnedTabs {
  private readonly keys = new Set<string>();

  markOpened(key: string): void {
    this.keys.delete(key);
    this.keys.add(key);
  }

  /** Oldest first. */
  list(): string[] {
    return [...this.keys];
  }

  /** Forgets tabs that no longer exist, so a file the user reopens later is theirs. */
  retainOnly(liveKeys: ReadonlySet<string>): void {
    for (const key of this.keys) {
      if (!liveKeys.has(key)) {
        this.keys.delete(key);
      }
    }
  }
}
