/** Remembers which file tabs AgentLens opened, in the order it opened them. */
export class OwnedTabs {
  /** Maps a key to whether a tab list has shown its tab yet. Insertion order is opening order. */
  private readonly confirmed = new Map<string, boolean>();

  markOpened(key: string): void {
    this.confirmed.delete(key);
    this.confirmed.set(key, false);
  }

  /** Oldest first. */
  list(): string[] {
    return [...this.confirmed.keys()];
  }

  /**
   * Forgets tabs that were seen and have since gone, so a file the user reopens later is theirs.
   * A tab that has not appeared in any list yet is kept, because VS Code can report a new tab
   * a moment after the open call returns.
   */
  retainOnly(liveKeys: ReadonlySet<string>): void {
    for (const [key, wasSeen] of this.confirmed) {
      if (liveKeys.has(key)) {
        this.confirmed.set(key, true);
      } else if (wasSeen) {
        this.confirmed.delete(key);
      }
    }
  }
}
