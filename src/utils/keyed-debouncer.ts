export class KeyedDebouncer {
  private readonly pending = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly delayMs: number) {}

  /**
   * Runs the task once, delayMs after the first call for a key. Calls for the same key
   * made while one is pending are absorbed, so a constant stream of changes cannot starve the task.
   */
  schedule(key: string, task: () => void): void {
    if (this.pending.has(key)) {
      return;
    }
    const handle = setTimeout(() => {
      this.pending.delete(key);
      task();
    }, this.delayMs);
    this.pending.set(key, handle);
  }

  dispose(): void {
    for (const handle of this.pending.values()) {
      clearTimeout(handle);
    }
    this.pending.clear();
  }
}
