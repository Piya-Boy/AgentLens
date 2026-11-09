import nodePath from "node:path";
import { describe, expect, it, vi } from "vitest";
import { EventManager } from "./event-manager";

function validEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventId: "e1",
    agentId: "claude",
    sessionId: "s1",
    action: "edit",
    status: "started",
    filePath: "/ws/src/a.ts",
    timestamp: 1_700_000_000_000,
    source: "adapter",
    ...overrides,
  };
}

function createManager(roots: readonly string[] = ["/ws"]) {
  const reportListenerError = vi.fn();
  const manager = new EventManager({
    getWorkspaceRoots: () => roots,
    reportListenerError,
    pathApi: nodePath.posix,
  });
  return { manager, reportListenerError };
}

describe("EventManager", () => {
  it("delivers a validated, normalized event to listeners", () => {
    const { manager } = createManager();
    const listener = vi.fn();
    manager.onEvent(listener);

    const result = manager.ingest(validEvent({ filePath: "/ws/src/../src/a.ts" }));

    expect(result.accepted).toBe(true);
    expect(listener).toHaveBeenCalledExactlyOnceWith(validEvent({ filePath: "/ws/src/a.ts" }));
  });

  it("rejects invalid events without notifying listeners", () => {
    const { manager } = createManager();
    const listener = vi.fn();
    manager.onEvent(listener);

    const result = manager.ingest(validEvent({ filePath: "/etc/passwd" }));

    expect(result).toEqual({ accepted: false, errors: ["filePath is outside the workspace"] });
    expect(listener).not.toHaveBeenCalled();
  });

  it("reads workspace roots at ingest time", () => {
    let roots: readonly string[] = [];
    const manager = new EventManager({
      getWorkspaceRoots: () => roots,
      reportListenerError: vi.fn(),
      pathApi: nodePath.posix,
    });

    expect(manager.ingest(validEvent()).accepted).toBe(false);
    roots = ["/ws"];
    expect(manager.ingest(validEvent()).accepted).toBe(true);
  });

  it("isolates a throwing listener and still notifies the others", () => {
    const { manager, reportListenerError } = createManager();
    const failure = new Error("boom");
    const after = vi.fn();
    manager.onEvent(() => {
      throw failure;
    });
    manager.onEvent(after);

    const result = manager.ingest(validEvent());

    expect(result.accepted).toBe(true);
    expect(reportListenerError).toHaveBeenCalledExactlyOnceWith(failure);
    expect(after).toHaveBeenCalledOnce();
  });

  it("stops notifying a disposed listener", () => {
    const { manager } = createManager();
    const listener = vi.fn();
    manager.onEvent(listener).dispose();

    manager.ingest(validEvent());

    expect(listener).not.toHaveBeenCalled();
  });

  it("tolerates a listener that disposes itself during dispatch", () => {
    const { manager } = createManager();
    const other = vi.fn();
    const subscription = manager.onEvent(() => {
      subscription.dispose();
    });
    manager.onEvent(other);

    manager.ingest(validEvent());

    expect(other).toHaveBeenCalledOnce();
  });
});
