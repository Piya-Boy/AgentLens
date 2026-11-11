import { describe, expect, it, vi } from "vitest";
import { RELEASE_PAGE_PREFIX } from "./release";
import {
  CHECK_INTERVAL_MS,
  LAST_CHECK_KEY,
  LAST_NOTIFIED_KEY,
  UpdateChecker,
  type UpdateOutcome,
  type UpdateState,
} from "./update-checker";

class MemoryState implements UpdateState {
  readonly values = new Map<string, unknown>();
  failWrites = false;

  get(key: string): unknown {
    return this.values.get(key);
  }

  update(key: string, value: unknown): Promise<void> {
    if (this.failWrites) {
      return Promise.reject(new Error("disk full"));
    }
    this.values.set(key, value);
    return Promise.resolve();
  }
}

function releaseBody(tag: string): unknown {
  return { tag_name: tag, html_url: `${RELEASE_PAGE_PREFIX}tag/${tag}`, draft: false, prerelease: false };
}

function setup(options: { current?: string; answer?: () => Promise<unknown>; state?: MemoryState } = {}) {
  const state = options.state ?? new MemoryState();
  const clock = { now: 1_000_000_000 };
  const fetchLatest = vi.fn(options.answer ?? (() => Promise.resolve(releaseBody("v0.2.0"))));
  const reportError = vi.fn();
  const checker = new UpdateChecker({
    currentVersion: options.current ?? "0.1.0",
    fetchLatest,
    state,
    now: () => clock.now,
    reportError,
  });
  return { checker, state, clock, fetchLatest, reportError };
}

function kinds(outcomes: readonly UpdateOutcome[]): string[] {
  return outcomes.map((outcome) => outcome.kind);
}

describe("checkNow", () => {
  it("reports a newer release with its page", async () => {
    const { checker } = setup();

    const outcome = await checker.checkNow();

    expect(outcome).toEqual({
      kind: "update-available",
      current: "0.1.0",
      release: {
        version: { major: 0, minor: 2, patch: 0 },
        label: "0.2.0",
        url: `${RELEASE_PAGE_PREFIX}tag/v0.2.0`,
      },
    });
  });

  it.each(["v0.1.0", "v0.0.9"])("says up to date for %s", async (tag) => {
    const { checker } = setup({ answer: () => Promise.resolve(releaseBody(tag)) });

    expect(await checker.checkNow()).toEqual({ kind: "up-to-date", current: "0.1.0" });
  });

  it("checks again even when it checked a moment ago", async () => {
    const { checker, fetchLatest } = setup();

    await checker.checkNow();
    await checker.checkNow();

    expect(fetchLatest).toHaveBeenCalledTimes(2);
  });

  it("reports a failed request with the reason instead of throwing", async () => {
    const { checker } = setup({ answer: () => Promise.reject(new Error("the server answered HTTP 404")) });

    expect(await checker.checkNow()).toEqual({ kind: "failed", reason: "the server answered HTTP 404" });
  });

  it("reports an answer that is not a release", async () => {
    const { checker } = setup({ answer: () => Promise.resolve({ tag_name: "nightly" }) });

    expect(await checker.checkNow()).toEqual({ kind: "failed", reason: "the answer was not a usable release" });
  });

  it("refuses to compare when the installed version is not major.minor.patch", async () => {
    const { checker, fetchLatest } = setup({ current: "0.1.0-dev" });

    const outcome = await checker.checkNow();

    expect(outcome.kind).toBe("failed");
    expect(fetchLatest).not.toHaveBeenCalled();
  });

  it("shares one request between overlapping checks", async () => {
    let resolveAnswer: (value: unknown) => void = () => undefined;
    const { checker, fetchLatest } = setup({
      answer: () =>
        new Promise((resolve) => {
          resolveAnswer = resolve;
        }),
    });

    const first = checker.checkNow();
    const second = checker.checkNow();
    resolveAnswer(releaseBody("v0.3.0"));

    expect(kinds(await Promise.all([first, second]))).toEqual(["update-available", "update-available"]);
    expect(fetchLatest).toHaveBeenCalledTimes(1);
  });
});

describe("checkIfDue", () => {
  it("checks the first time and then at most once a day", async () => {
    const { checker, clock, fetchLatest } = setup({ answer: () => Promise.resolve(releaseBody("v0.1.0")) });

    const outcomes = [await checker.checkIfDue()];
    clock.now += CHECK_INTERVAL_MS - 1;
    outcomes.push(await checker.checkIfDue());
    clock.now += 1;
    outcomes.push(await checker.checkIfDue());

    expect(kinds(outcomes)).toEqual(["up-to-date", "skipped", "up-to-date"]);
    expect(fetchLatest).toHaveBeenCalledTimes(2);
  });

  it("reports each newer version once", async () => {
    let tag = "v0.2.0";
    const { checker, clock } = setup({ answer: () => Promise.resolve(releaseBody(tag)) });

    const first = await checker.checkIfDue();
    clock.now += CHECK_INTERVAL_MS;
    const second = await checker.checkIfDue();
    tag = "v0.3.0";
    clock.now += CHECK_INTERVAL_MS;
    const third = await checker.checkIfDue();

    expect(kinds([first, second, third])).toEqual(["update-available", "skipped", "update-available"]);
    expect(second).toEqual({ kind: "skipped", reason: "already-notified" });
  });

  it("does not repeat a release the user already looked up by hand", async () => {
    const { checker, clock } = setup();

    await checker.checkNow();
    clock.now += CHECK_INTERVAL_MS;

    expect(await checker.checkIfDue()).toEqual({ kind: "skipped", reason: "already-notified" });
  });

  it("waits a day before retrying after a failure, so an offline machine is not polled", async () => {
    const { checker, clock, fetchLatest } = setup({ answer: () => Promise.reject(new Error("fetch failed")) });

    const first = await checker.checkIfDue();
    clock.now += 60_000;
    const second = await checker.checkIfDue();

    expect(kinds([first, second])).toEqual(["failed", "skipped"]);
    expect(fetchLatest).toHaveBeenCalledTimes(1);
  });

  it("checks again when the clock went backwards", async () => {
    const { checker, clock, fetchLatest } = setup({ answer: () => Promise.resolve(releaseBody("v0.1.0")) });

    await checker.checkIfDue();
    clock.now -= 5 * CHECK_INTERVAL_MS;
    await checker.checkIfDue();

    expect(fetchLatest).toHaveBeenCalledTimes(2);
  });

  it("ignores a stored check time that is not a number", async () => {
    const state = new MemoryState();
    state.values.set(LAST_CHECK_KEY, "yesterday");
    const { checker, fetchLatest } = setup({ state });

    await checker.checkIfDue();

    expect(fetchLatest).toHaveBeenCalledTimes(1);
  });
});

describe("saving state", () => {
  it("records when it checked and which version it reported", async () => {
    const { checker, state, clock } = setup();

    await checker.checkIfDue();

    expect(state.values.get(LAST_CHECK_KEY)).toBe(clock.now);
    expect(state.values.get(LAST_NOTIFIED_KEY)).toBe("0.2.0");
  });

  it("still answers when saving fails, and says so", async () => {
    const state = new MemoryState();
    state.failWrites = true;
    const { checker, reportError } = setup({ state });

    const outcome = await checker.checkNow();

    expect(outcome.kind).toBe("update-available");
    expect(reportError).toHaveBeenCalled();
  });
});
