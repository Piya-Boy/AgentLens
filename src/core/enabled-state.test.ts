import { describe, expect, it, vi } from "vitest";
import { ENABLED_STATE_KEY, EnabledState, type StateStore } from "./enabled-state";

function createStore(initial: Record<string, unknown> = {}): StateStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>(Object.entries(initial));
  return {
    data,
    get<T>(key: string, defaultValue: T): T {
      return data.has(key) ? (data.get(key) as T) : defaultValue;
    },
    update(key: string, value: unknown): Promise<void> {
      data.set(key, value);
      return Promise.resolve();
    },
  };
}

describe("EnabledState", () => {
  it("is enabled by default", () => {
    expect(new EnabledState(createStore()).isEnabled).toBe(true);
  });

  it("restores a persisted disabled state", () => {
    const state = new EnabledState(createStore({ [ENABLED_STATE_KEY]: false }));
    expect(state.isEnabled).toBe(false);
  });

  it("persists changes to the store", async () => {
    const store = createStore();
    const state = new EnabledState(store);
    await state.setEnabled(false);
    expect(store.data.get(ENABLED_STATE_KEY)).toBe(false);
    expect(state.isEnabled).toBe(false);
  });

  it("notifies listeners only when the value changes", async () => {
    const state = new EnabledState(createStore());
    const listener = vi.fn();
    state.onDidChange(listener);

    await state.setEnabled(true);
    expect(listener).not.toHaveBeenCalled();

    await state.setEnabled(false);
    expect(listener).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("stops notifying after dispose", async () => {
    const state = new EnabledState(createStore());
    const listener = vi.fn();
    state.onDidChange(listener).dispose();
    await state.setEnabled(false);
    expect(listener).not.toHaveBeenCalled();
  });
});
