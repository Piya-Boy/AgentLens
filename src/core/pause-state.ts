type ChangeListener = (paused: boolean) => void;

export class PauseState {
  private paused = false;
  private readonly listeners = new Set<ChangeListener>();

  get isPaused(): boolean {
    return this.paused;
  }

  pause(): void {
    this.set(true);
  }

  resume(): void {
    this.set(false);
  }

  onDidChange(listener: ChangeListener): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  private set(paused: boolean): void {
    if (paused === this.paused) {
      return;
    }
    this.paused = paused;
    for (const listener of [...this.listeners]) {
      listener(paused);
    }
  }
}
