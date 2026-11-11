import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyedDebouncer } from "./keyed-debouncer";

describe("KeyedDebouncer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the task after the delay", () => {
    const debouncer = new KeyedDebouncer(200);
    const task = vi.fn();
    debouncer.schedule("a", task);

    vi.advanceTimersByTime(199);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledOnce();
  });

  it("absorbs repeated calls for the same key while pending", () => {
    const debouncer = new KeyedDebouncer(200);
    const task = vi.fn();
    debouncer.schedule("a", task);
    vi.advanceTimersByTime(150);
    debouncer.schedule("a", task);
    debouncer.schedule("a", task);

    vi.advanceTimersByTime(50);
    expect(task).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1000);
    expect(task).toHaveBeenCalledOnce();
  });

  it("does not starve under a constant stream of calls", () => {
    const debouncer = new KeyedDebouncer(200);
    const task = vi.fn();
    for (let elapsed = 0; elapsed < 1000; elapsed += 50) {
      debouncer.schedule("a", task);
      vi.advanceTimersByTime(50);
    }
    expect(task.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it("schedules again after the task has run", () => {
    const debouncer = new KeyedDebouncer(100);
    const task = vi.fn();
    debouncer.schedule("a", task);
    vi.advanceTimersByTime(100);
    debouncer.schedule("a", task);
    vi.advanceTimersByTime(100);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("keeps keys independent", () => {
    const debouncer = new KeyedDebouncer(100);
    const first = vi.fn();
    const second = vi.fn();
    debouncer.schedule("a", first);
    debouncer.schedule("b", second);
    vi.advanceTimersByTime(100);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it("drops pending tasks on dispose", () => {
    const debouncer = new KeyedDebouncer(100);
    const task = vi.fn();
    debouncer.schedule("a", task);
    debouncer.dispose();
    vi.advanceTimersByTime(1000);
    expect(task).not.toHaveBeenCalled();
  });
});
