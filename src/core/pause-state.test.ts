import { describe, expect, it, vi } from "vitest";
import { PauseState } from "./pause-state";

describe("PauseState", () => {
  it("starts resumed", () => {
    expect(new PauseState().isPaused).toBe(false);
  });

  it("pauses and resumes", () => {
    const state = new PauseState();
    state.pause();
    expect(state.isPaused).toBe(true);
    state.resume();
    expect(state.isPaused).toBe(false);
  });

  it("notifies listeners only when the value changes", () => {
    const state = new PauseState();
    const listener = vi.fn();
    state.onDidChange(listener);

    state.resume();
    expect(listener).not.toHaveBeenCalled();

    state.pause();
    state.pause();
    expect(listener).toHaveBeenCalledExactlyOnceWith(true);

    state.resume();
    expect(listener).toHaveBeenLastCalledWith(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("stops notifying after dispose", () => {
    const state = new PauseState();
    const listener = vi.fn();
    state.onDidChange(listener).dispose();
    state.pause();
    expect(listener).not.toHaveBeenCalled();
  });
});
