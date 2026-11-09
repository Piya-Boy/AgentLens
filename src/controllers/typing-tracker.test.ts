import { describe, expect, it } from "vitest";
import { TypingTracker } from "./typing-tracker";

function createTracker(graceMs = 3000) {
  let now = 10_000;
  const tracker = new TypingTracker(graceMs, () => now);
  return {
    tracker,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("TypingTracker", () => {
  it("is not busy before any typing", () => {
    expect(createTracker().tracker.isBusy()).toBe(false);
  });

  it("is busy right after typing", () => {
    const { tracker } = createTracker();
    tracker.recordTyping();
    expect(tracker.isBusy()).toBe(true);
  });

  it("stays busy until the grace period has passed", () => {
    const { tracker, advance } = createTracker(3000);
    tracker.recordTyping();
    advance(2999);
    expect(tracker.isBusy()).toBe(true);
    advance(1);
    expect(tracker.isBusy()).toBe(false);
  });

  it("extends the grace period on every keystroke", () => {
    const { tracker, advance } = createTracker(3000);
    tracker.recordTyping();
    advance(2000);
    tracker.recordTyping();
    advance(2000);
    expect(tracker.isBusy()).toBe(true);
  });
});
