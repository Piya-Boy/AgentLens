import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentFileEvent } from "../models/agent-file-event";
import { FocusController } from "./focus-controller";

function event(overrides: Partial<AgentFileEvent> = {}): AgentFileEvent {
  return {
    eventId: "e1",
    agentId: "claude",
    sessionId: "s1",
    action: "edit",
    status: "started",
    filePath: "/ws/a.ts",
    timestamp: 1000,
    source: "adapter",
    ...overrides,
  };
}

function createController(
  options: {
    autoFocus?: boolean;
    paused?: boolean;
    cooldownMs?: number;
    openFile?: (filePath: string) => Promise<void>;
  } = {},
) {
  const openFile = vi.fn(options.openFile ?? (() => Promise.resolve()));
  const reportError = vi.fn();
  const controller = new FocusController({
    openFile,
    isPaused: () => options.paused ?? false,
    isAutoFocusEnabled: () => options.autoFocus ?? true,
    getCooldownMs: () => options.cooldownMs ?? 0,
    reportError,
  });
  return { controller, openFile, reportError };
}

describe("FocusController", () => {
  it("opens the file for a pre-edit adapter event", async () => {
    const { controller, openFile } = createController();
    expect(await controller.handle(event())).toEqual({ focused: true });
    expect(openFile).toHaveBeenCalledExactlyOnceWith("/ws/a.ts");
  });

  it("never focuses on a filesystem observation", async () => {
    const { controller, openFile } = createController();
    const outcome = await controller.handle(event({ source: "filesystem", status: "observed" }));
    expect(outcome).toEqual({ focused: false, reason: "not-pre-edit" });
    expect(openFile).not.toHaveBeenCalled();
  });

  it.each([
    ["completed status", { status: "completed" as const }],
    ["failed status", { status: "failed" as const }],
    ["create action", { action: "create" as const }],
    ["read action", { action: "read" as const }],
    ["delete action", { action: "delete" as const }],
  ])("skips events with %s", async (_label, change) => {
    const { controller, openFile } = createController();
    expect(await controller.handle(event(change))).toEqual({ focused: false, reason: "not-pre-edit" });
    expect(openFile).not.toHaveBeenCalled();
  });

  it("skips while paused", async () => {
    const { controller, openFile } = createController({ paused: true });
    expect(await controller.handle(event())).toEqual({ focused: false, reason: "paused" });
    expect(openFile).not.toHaveBeenCalled();
  });

  it("skips when auto focus is disabled", async () => {
    const { controller, openFile } = createController({ autoFocus: false });
    expect(await controller.handle(event())).toEqual({ focused: false, reason: "auto-focus-disabled" });
    expect(openFile).not.toHaveBeenCalled();
  });

  it("reads the auto focus setting on every event", async () => {
    let autoFocus = false;
    const openFile = vi.fn(() => Promise.resolve());
    const controller = new FocusController({
      openFile,
      isPaused: () => false,
      isAutoFocusEnabled: () => autoFocus,
      getCooldownMs: () => 0,
      reportError: vi.fn(),
    });

    await controller.handle(event());
    autoFocus = true;
    await controller.handle(event({ eventId: "e2" }));

    expect(openFile).toHaveBeenCalledOnce();
  });

  it("reports an asynchronous open failure without throwing", async () => {
    const failure = new Error("file not found");
    const { controller, reportError } = createController({ openFile: () => Promise.reject(failure) });
    expect(await controller.handle(event())).toEqual({ focused: false, reason: "error" });
    expect(reportError).toHaveBeenCalledExactlyOnceWith(failure);
  });

  it("reports a synchronous open failure without throwing", async () => {
    const failure = new Error("boom");
    const { controller, reportError } = createController({
      openFile: () => {
        throw failure;
      },
    });
    expect(await controller.handle(event())).toEqual({ focused: false, reason: "error" });
    expect(reportError).toHaveBeenCalledExactlyOnceWith(failure);
  });
});

describe("FocusController cooldown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens the first file immediately and queues requests during the cooldown", async () => {
    const { controller, openFile } = createController({ cooldownMs: 1000 });

    expect(await controller.handle(event({ filePath: "/ws/a.ts" }))).toEqual({ focused: true });
    expect(await controller.handle(event({ eventId: "e2", filePath: "/ws/b.ts" }))).toEqual({
      focused: false,
      reason: "queued",
    });
    expect(openFile).toHaveBeenCalledExactlyOnceWith("/ws/a.ts");
  });

  it("opens only the latest queued file when the cooldown ends", async () => {
    const { controller, openFile } = createController({ cooldownMs: 1000 });
    await controller.handle(event({ filePath: "/ws/a.ts" }));
    await controller.handle(event({ eventId: "e2", filePath: "/ws/b.ts" }));
    await controller.handle(event({ eventId: "e3", filePath: "/ws/c.ts" }));

    await vi.advanceTimersByTimeAsync(1000);

    expect(openFile.mock.calls).toEqual([["/ws/a.ts"], ["/ws/c.ts"]]);
  });

  it("starts a new cooldown after opening a queued file", async () => {
    const { controller, openFile } = createController({ cooldownMs: 1000 });
    await controller.handle(event({ filePath: "/ws/a.ts" }));
    await controller.handle(event({ eventId: "e2", filePath: "/ws/b.ts" }));
    await vi.advanceTimersByTimeAsync(1000);

    expect(await controller.handle(event({ eventId: "e3", filePath: "/ws/c.ts" }))).toEqual({
      focused: false,
      reason: "queued",
    });
    await vi.advanceTimersByTimeAsync(1000);

    expect(openFile.mock.calls).toEqual([["/ws/a.ts"], ["/ws/b.ts"], ["/ws/c.ts"]]);
  });

  it("opens immediately again once the cooldown ends with nothing queued", async () => {
    const { controller, openFile } = createController({ cooldownMs: 1000 });
    await controller.handle(event({ filePath: "/ws/a.ts" }));
    await vi.advanceTimersByTimeAsync(1000);

    expect(await controller.handle(event({ eventId: "e2", filePath: "/ws/b.ts" }))).toEqual({ focused: true });
    expect(openFile).toHaveBeenCalledTimes(2);
  });

  it("does not queue ineligible events", async () => {
    const { controller, openFile } = createController({ cooldownMs: 1000 });
    await controller.handle(event({ filePath: "/ws/a.ts" }));
    await controller.handle(event({ eventId: "e2", filePath: "/ws/b.ts", status: "completed" }));

    await vi.advanceTimersByTimeAsync(1000);

    expect(openFile).toHaveBeenCalledExactlyOnceWith("/ws/a.ts");
  });

  it("drops the queued file when focus is paused before the cooldown ends", async () => {
    let paused = false;
    const openFile = vi.fn(() => Promise.resolve());
    const controller = new FocusController({
      openFile,
      isPaused: () => paused,
      isAutoFocusEnabled: () => true,
      getCooldownMs: () => 1000,
      reportError: vi.fn(),
    });
    await controller.handle(event({ filePath: "/ws/a.ts" }));
    await controller.handle(event({ eventId: "e2", filePath: "/ws/b.ts" }));

    paused = true;
    await vi.advanceTimersByTimeAsync(1000);

    expect(openFile).toHaveBeenCalledExactlyOnceWith("/ws/a.ts");
  });

  it("reports an error from a queued open", async () => {
    const failure = new Error("gone");
    const openFile = vi.fn((filePath: string) =>
      filePath === "/ws/b.ts" ? Promise.reject(failure) : Promise.resolve(),
    );
    const reportError = vi.fn();
    const controller = new FocusController({
      openFile,
      isPaused: () => false,
      isAutoFocusEnabled: () => true,
      getCooldownMs: () => 1000,
      reportError,
    });
    await controller.handle(event({ filePath: "/ws/a.ts" }));
    await controller.handle(event({ eventId: "e2", filePath: "/ws/b.ts" }));

    await vi.advanceTimersByTimeAsync(1000);

    expect(reportError).toHaveBeenCalledExactlyOnceWith(failure);
  });

  it("cancels the cooldown and the queue on dispose", async () => {
    const { controller, openFile } = createController({ cooldownMs: 1000 });
    await controller.handle(event({ filePath: "/ws/a.ts" }));
    await controller.handle(event({ eventId: "e2", filePath: "/ws/b.ts" }));

    controller.dispose();
    await vi.advanceTimersByTimeAsync(5000);

    expect(openFile).toHaveBeenCalledExactlyOnceWith("/ws/a.ts");
  });
});
