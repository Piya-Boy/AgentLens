import { describe, expect, it, vi } from "vitest";
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
  options: { autoFocus?: boolean; paused?: boolean; openFile?: (filePath: string) => Promise<void> } = {},
) {
  const openFile = vi.fn(options.openFile ?? (() => Promise.resolve()));
  const reportError = vi.fn();
  const controller = new FocusController({
    openFile,
    isPaused: () => options.paused ?? false,
    isAutoFocusEnabled: () => options.autoFocus ?? true,
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
