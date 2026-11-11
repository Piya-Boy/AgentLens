export interface StateStore {
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): PromiseLike<void>;
}

export const ENABLED_STATE_KEY = "agentlens.enabled";

type ChangeListener = (enabled: boolean) => void;

export class EnabledState {
  private readonly listeners = new Set<ChangeListener>();

  constructor(private readonly store: StateStore) {}

  get isEnabled(): boolean {
    return this.store.get<boolean>(ENABLED_STATE_KEY, true);
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (enabled === this.isEnabled) {
      return;
    }
    await this.store.update(ENABLED_STATE_KEY, enabled);
    for (const listener of this.listeners) {
      listener(enabled);
    }
  }

  onDidChange(listener: ChangeListener): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }
}
