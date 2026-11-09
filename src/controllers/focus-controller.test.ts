import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentFileEvent } from "../models/agent-file-event";
import { FocusController, parseFocusMode, type FocusMode } from "./focus-controller";

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
    mode?: FocusMode;
    paused?: boolean;
    cooldownMs?: number;
    openFile?: (filePath: string) => Promise<void>;
    notifyFile?: (event: AgentFileEvent) => void;
  } = {},
) {
  const openFile = vi.fn(options.openFile ?? (() => Promise.resolve()));
  const notifyFile = vi.fn(options.notifyFile ?? (() => undefined));
  const reportError = vi.fn();
  const controller = new FocusController({
    openFile,
    notifyFile,
    isPaused: () => options.paused ?? false,
    getMode: () => options.mode ?? "auto",
    getCooldownMs: () => options.cooldownMs ?? 0,
    reportError,
  });
  return { controller, openFile, notifyFile, reportError };
}

describe("parseFocusMode", () => {
  it.each(["auto", "notify", "off"] as const)("accepts %s", (mode) => {
    expect(parseFocusMode(mode)).toBe(mode);
  });

  it.each([[true], [false], [undefined], [null], [""], ["AUTO"], ["manual"], [1]])(
    "falls back to auto for %j",
    (value) => {
      expect(parseFocusMode(value)).toBe("auto");
    },
  );
});

describe("FocusController", () => {
  it("opens the file for a pre-edit adapter event", async () => {
    const { controller, openFile } = createController();
    expect(await controller.handle(event())).toEqual({ focused: true });
    expect(openFile).toHaveBeenCalledExactlyOnceWith("/ws/a.ts");
  });

  it("never focuses on a filesystem observation", async () => {
    const { controller, openFile, notifyFile } = createController();
    const outcome = await controller.handle(event({ source: "filesystem", status: "observed" }));
    expect(outcome).toEqual({ focused: false, reason: "not-pre-edit" });
    expect(openFile).not.toHaveBeenCalled();
    expect(notifyFile).not.toHaveBeenCalled();
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

  it("skips while paused in every mode", async () => {
    for (const mode of ["auto", "notify"] as const) {
      const { controller, openFile, notifyFile } = createController({ paused: true, mode });
      expect(await controller.handle(event())).toEqual({ focused: false, reason: "paused" });
      expect(openFile).not.toHaveBeenCalled();
      expect(notifyFile).not.toHaveBeenCalled();
    }
  });

  it("neither opens nor notifies when the mode is off", async () => {
    const { controller, openFile, notifyFile } = createController({ mode: "off" });
    expect(await controller.handle(event())).toEqual({ focused: false, reason: "focus-off" });
    expect(openFile).not.toHaveBeenCalled();
    expect(notifyFile).not.toHaveBeenCalled();
  });

  it("only notifies in notify mode and does not open the file", async () => {
    const { controller, openFile, notifyFile } = createController({ mode: "notify" });
    const pre = event();
    expect(await controller.handle(pre)).toEqual({ focused: false, reason: "notified" });
    expect(notifyFile).toHaveBeenCalledExactlyOnceWith(pre);
    expect(openFile).not.toHaveBeenCalled();
  });

  it("reads the mode on every event", async () => {
    let mode: FocusMode = "off";
    const openFile = vi.fn(() => Promise.resolve());
    const notifyFile = vi.fn();
    const controller = new FocusController({
      openFile,
      notifyFile,
      isPaused: () => false,
      getMode: () => mode,
      getCooldownMs: () => 0,
      reportError: vi.fn(),
    });

    await controller.handle(event());
    mode = "notify";
    await controller.handle(event({ eventId: "e2" }));
    mode = "auto";
    await controller.handle(event({ eventId: "e3" }));

    expect(notifyFile).toHaveBeenCalledOnce();
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

  it("reports a notification failure without throwing", async () => {
    const failure = new Error("no window");
    const { controller, reportError } = createController({
      mode: "notify",
      notifyFile: () => {
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

  it("collapses a burst into the first and the latest notification in notify mode", async () => {
    const { controller, notifyFile, openFile } = createController({ cooldownMs: 1000, mode: "notify" });
    await controller.handle(event({ filePath: "/ws/a.ts" }));
    await controller.handle(event({ eventId: "e2", filePath: "/ws/b.ts" }));
    await controller.handle(event({ eventId: "e3", filePath: "/ws/c.ts" }));

    await vi.advanceTimersByTimeAsync(1000);

    expect(notifyFile.mock.calls.map(([notified]) => notified.filePath)).toEqual(["/ws/a.ts", "/ws/c.ts"]);
    expect(openFile).not.toHaveBeenCalled();
  });

  it("drops the queued file when focus is paused before the cooldown ends", async () => {
    let paused = false;
    const openFile = vi.fn(() => Promise.resolve());
    const controller = new FocusController({
      openFile,
      notifyFile: vi.fn(),
      isPaused: () => paused,
      getMode: () => "auto",
      getCooldownMs: () => 1000,
      reportError: vi.fn(),
    });
    await controller.handle(event({ filePath: "/ws/a.ts" }));
    await controller.handle(event({ eventId: "e2", filePath: "/ws/b.ts" }));

    paused = true;
    await vi.advanceTimersByTimeAsync(1000);

    expect(openFile).toHaveBeenCalledExactlyOnceWith("/ws/a.ts");
  });

  it("drops the queued file when the mode becomes off before the cooldown ends", async () => {
    let mode: FocusMode = "auto";
    const openFile = vi.fn(() => Promise.resolve());
    const controller = new FocusController({
      openFile,
      notifyFile: vi.fn(),
      isPaused: () => false,
      getMode: () => mode,
      getCooldownMs: () => 1000,
      reportError: vi.fn(),
    });
    await controller.handle(event({ filePath: "/ws/a.ts" }));
    await controller.handle(event({ eventId: "e2", filePath: "/ws/b.ts" }));

    mode = "off";
    await vi.advanceTimersByTimeAsync(1000);

    expect(openFile).toHaveBeenCalledExactlyOnceWith("/ws/a.ts");
  });

  it("uses the mode in force when the cooldown ends for the queued file", async () => {
    let mode: FocusMode = "auto";
    const openFile = vi.fn(() => Promise.resolve());
    const notifyFile = vi.fn();
    const controller = new FocusController({
      openFile,
      notifyFile,
      isPaused: () => false,
      getMode: () => mode,
      getCooldownMs: () => 1000,
      reportError: vi.fn(),
    });
    await controller.handle(event({ filePath: "/ws/a.ts" }));
    await controller.handle(event({ eventId: "e2", filePath: "/ws/b.ts" }));

    mode = "notify";
    await vi.advanceTimersByTimeAsync(1000);

    expect(openFile).toHaveBeenCalledExactlyOnceWith("/ws/a.ts");
    expect(notifyFile).toHaveBeenCalledOnce();
  });

  it("reports an error from a queued open", async () => {
    const failure = new Error("gone");
    const openFile = vi.fn((filePath: string) =>
      filePath === "/ws/b.ts" ? Promise.reject(failure) : Promise.resolve(),
    );
    const reportError = vi.fn();
    const controller = new FocusController({
      openFile,
      notifyFile: vi.fn(),
      isPaused: () => false,
      getMode: () => "auto",
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
