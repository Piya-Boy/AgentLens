import nodePath from "node:path";
import { describe, expect, it } from "vitest";
import { EventManager } from "../core/event-manager";
import type { AgentFileEvent } from "../models/agent-file-event";
import { runAdapter, type AdapterParseResult, type AgentAdapter } from "./adapter";
import { claudeCodeAdapter } from "./claude/pre-tool-use";

const workspace = nodePath.resolve("ws");

function adapterEvent(overrides: Partial<AgentFileEvent> = {}): AgentFileEvent {
  return {
    eventId: "e1",
    agentId: "other-agent",
    sessionId: "s1",
    action: "edit",
    status: "started",
    filePath: nodePath.join(workspace, "a.ts"),
    timestamp: 1000,
    source: "adapter",
    ...overrides,
  };
}

function adapterOf(id: string, parse: (payload: unknown, now: number) => AdapterParseResult): AgentAdapter {
  return { id, parse };
}

describe("runAdapter", () => {
  it("passes through a parsed event", () => {
    const event = adapterEvent();
    expect(runAdapter(adapterOf("other-agent", () => ({ ok: true, event })), {}, 1)).toEqual({ ok: true, event });
  });

  it("passes through a rejection from the adapter", () => {
    const rejection = { ok: false, reason: "malformed", detail: "bad" } as const;
    expect(runAdapter(adapterOf("other-agent", () => rejection), {}, 1)).toEqual(rejection);
  });

  it("hands the payload and the time to the adapter", () => {
    const seen: unknown[] = [];
    runAdapter(
      adapterOf("other-agent", (payload, now) => {
        seen.push(payload, now);
        return { ok: false, reason: "unsupported", detail: "x" };
      }),
      { a: 1 },
      42,
    );
    expect(seen).toEqual([{ a: 1 }, 42]);
  });

  it("turns a thrown error into a failed result naming the adapter", () => {
    const result = runAdapter(
      adapterOf("broken", () => {
        throw new Error("boom");
      }),
      {},
      1,
    );
    expect(result).toEqual({ ok: false, reason: "failed", detail: "adapter broken threw: boom" });
  });

  it("turns a thrown non-error value into a failed result", () => {
    const result = runAdapter(
      adapterOf("broken", () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw "text";
      }),
      {},
      1,
    );
    expect(result).toEqual({ ok: false, reason: "failed", detail: "adapter broken threw: text" });
  });

  it.each([[undefined], [null], ["ok"], [{}], [{ ok: "yes" }]])(
    "rejects an invalid result %j from the adapter",
    (invalid) => {
      const result = runAdapter(adapterOf("odd", () => invalid as AdapterParseResult), {}, 1);
      expect(result).toEqual({ ok: false, reason: "failed", detail: "adapter odd returned an invalid result" });
    },
  );
});

describe("adapter failure isolation", () => {
  it("keeps ingesting events from a healthy adapter after another adapter fails", () => {
    const accepted: AgentFileEvent[] = [];
    const manager = new EventManager({
      getWorkspaceRoots: () => [workspace],
      reportListenerError: () => undefined,
    });
    manager.onEvent((event) => accepted.push(event));

    const broken = adapterOf("broken", () => {
      throw new Error("boom");
    });
    const healthy = adapterOf("healthy", (_payload, now) => ({
      ok: true,
      event: adapterEvent({ agentId: "healthy", timestamp: now }),
    }));

    const ingested = [broken, healthy, broken, healthy].map((adapter, index) => {
      const result = runAdapter(adapter, {}, 1000 + index * 1000);
      return result.ok && manager.ingest({ ...result.event, eventId: `e${String(index)}` }).accepted;
    });

    expect(ingested).toEqual([false, true, false, true]);
    expect(accepted).toHaveLength(2);
  });
});

describe("claudeCodeAdapter", () => {
  it("is the Claude Code parser under the shared contract", () => {
    expect(claudeCodeAdapter.id).toBe("claude-code");
    const result = runAdapter(claudeCodeAdapter, { hook_event_name: "PostToolUse" }, 1);
    expect(result.ok).toBe(false);
  });
});
