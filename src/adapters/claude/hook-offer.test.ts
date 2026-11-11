import nodePath from "node:path";
import { describe, expect, it } from "vitest";
import type { HookStatus } from "./hook-installer";
import { OFFER_INSTALL, OFFER_NEVER, runHookOffer, type HookOfferDeps } from "./hook-offer";

interface Harness {
  readonly deps: HookOfferDeps;
  readonly calls: string[];
  readonly logs: string[];
  readonly messages: string[];
}

interface Setup {
  enabled?: boolean;
  trusted?: boolean;
  folder?: string | undefined;
  existing?: readonly string[];
  status?: HookStatus;
  optedOut?: boolean;
  offeredHere?: boolean;
  answer?: string | undefined;
  askFails?: boolean;
  installResult?: boolean;
  installThrows?: boolean;
  markFails?: boolean;
}

const FOLDER = "/work/project";
const HOME = "/home/me";

function harness(setup: Setup = {}): Harness {
  const calls: string[] = [];
  const logs: string[] = [];
  const messages: string[] = [];
  const existing = new Set((setup.existing ?? []).map((target) => nodePath.normalize(target)));
  const deps: HookOfferDeps = {
    isEnabled: () => setup.enabled ?? true,
    isTrusted: () => setup.trusted ?? true,
    folder: "folder" in setup ? setup.folder : FOLDER,
    homeFolder: HOME,
    pathExists: (target) => Promise.resolve(existing.has(nodePath.normalize(target))),
    inspect: () => {
      calls.push("inspect");
      return Promise.resolve(setup.status ?? { kind: "missing" });
    },
    store: {
      isOptedOut: () => setup.optedOut ?? false,
      wasOfferedHere: () => setup.offeredHere ?? false,
      markOfferedHere: () => {
        calls.push("markOfferedHere");
        return setup.markFails === true ? Promise.reject(new Error("state is read-only")) : Promise.resolve();
      },
      optOut: () => {
        calls.push("optOut");
        return Promise.resolve();
      },
    },
    ask: (message) => {
      calls.push("ask");
      messages.push(message);
      return setup.askFails === true ? Promise.reject(new Error("no window")) : Promise.resolve(setup.answer);
    },
    install: () => {
      calls.push("install");
      return setup.installThrows === true ? Promise.reject(new Error("disk full")) : Promise.resolve(setup.installResult ?? true);
    },
    log: (line) => {
      logs.push(line);
    },
  };
  return { deps, calls, logs, messages };
}

const WITH_CLAUDE = { existing: [`${HOME}/.claude`] };

describe("runHookOffer: when it stays quiet", () => {
  it("does nothing while AgentLens is disabled", async () => {
    const h = harness({ ...WITH_CLAUDE, enabled: false });
    expect(await runHookOffer(h.deps)).toBe("disabled");
    expect(h.calls).toEqual([]);
  });

  it("does nothing in an untrusted workspace", async () => {
    const h = harness({ ...WITH_CLAUDE, trusted: false });
    expect(await runHookOffer(h.deps)).toBe("untrusted");
    expect(h.calls).toEqual([]);
  });

  it("does nothing without a folder", async () => {
    const h = harness({ ...WITH_CLAUDE, folder: undefined });
    expect(await runHookOffer(h.deps)).toBe("no-folder");
    expect(h.calls).toEqual([]);
  });

  it("does nothing after the user chose not to be asked again", async () => {
    const h = harness({ ...WITH_CLAUDE, optedOut: true });
    expect(await runHookOffer(h.deps)).toBe("opted-out");
    expect(h.calls).toEqual([]);
  });

  it("asks once per workspace", async () => {
    const h = harness({ ...WITH_CLAUDE, offeredHere: true });
    expect(await runHookOffer(h.deps)).toBe("already-offered");
    expect(h.calls).toEqual([]);
  });

  it("asks again when told to repeat", async () => {
    const h = harness({ ...WITH_CLAUDE, offeredHere: true, answer: undefined });
    expect(await runHookOffer(h.deps, { repeat: true })).toBe("declined");
    expect(h.calls).toContain("ask");
  });

  it("does nothing when there is no sign of Claude Code", async () => {
    const h = harness();
    expect(await runHookOffer(h.deps)).toBe("no-claude-code");
    expect(h.calls).toEqual([]);
  });

  it("does nothing when the hook is already installed", async () => {
    const h = harness({ ...WITH_CLAUDE, status: { kind: "installed" } });
    expect(await runHookOffer(h.deps)).toBe("already-installed");
    expect(h.calls).toEqual(["inspect"]);
  });

  it("does not ask about a settings file it cannot read, and says why in the log", async () => {
    const h = harness({ ...WITH_CLAUDE, status: { kind: "unreadable", reason: "settings.local.json is not valid JSON; it was not modified" } });
    expect(await runHookOffer(h.deps)).toBe("unreadable");
    expect(h.calls).toEqual(["inspect"]);
    expect(h.logs.join("\n")).toContain("not valid JSON");
  });
});

describe("runHookOffer: signs of Claude Code", () => {
  it.each([
    ["the user's Claude Code folder", [`${HOME}/.claude`]],
    ["a .claude folder in the project", [`${FOLDER}/.claude`]],
    ["a CLAUDE.md in the project", [`${FOLDER}/CLAUDE.md`]],
  ])("offers when it finds %s", async (_name, existing) => {
    const h = harness({ existing, answer: undefined });
    expect(await runHookOffer(h.deps)).toBe("declined");
    expect(h.calls).toContain("ask");
  });

  it("does not offer for unrelated files", async () => {
    const h = harness({ existing: [`${FOLDER}/package.json`, `${HOME}/.config`] });
    expect(await runHookOffer(h.deps)).toBe("no-claude-code");
  });
});

describe("runHookOffer: the question", () => {
  it("names the file and says what the hook reports", async () => {
    const h = harness({ ...WITH_CLAUDE });
    await runHookOffer(h.deps);
    expect(h.messages).toHaveLength(1);
    expect(h.messages[0]).toContain(".claude/settings.local.json");
    expect(h.messages[0]).toContain("project");
    expect(h.messages[0]).toContain("never blocks");
  });

  it("is remembered as asked before the question is shown, so closing it never repeats it", async () => {
    const h = harness({ ...WITH_CLAUDE, answer: undefined });
    await runHookOffer(h.deps);
    expect(h.calls.indexOf("markOfferedHere")).toBeGreaterThanOrEqual(0);
    expect(h.calls.indexOf("markOfferedHere")).toBeLessThan(h.calls.indexOf("ask"));
  });

  it("installs only when the user presses Install", async () => {
    const h = harness({ ...WITH_CLAUDE, answer: OFFER_INSTALL });
    expect(await runHookOffer(h.deps)).toBe("installed");
    expect(h.calls.filter((call) => call === "install")).toHaveLength(1);
  });

  it("writes nothing when the question is closed", async () => {
    const h = harness({ ...WITH_CLAUDE, answer: undefined });
    expect(await runHookOffer(h.deps)).toBe("declined");
    expect(h.calls).not.toContain("install");
    expect(h.calls).not.toContain("optOut");
  });

  it("stops asking everywhere on Don't ask again, and writes nothing", async () => {
    const h = harness({ ...WITH_CLAUDE, answer: OFFER_NEVER });
    expect(await runHookOffer(h.deps)).toBe("never");
    expect(h.calls).toContain("optOut");
    expect(h.calls).not.toContain("install");
  });

  it("ignores an answer it does not know", async () => {
    const h = harness({ ...WITH_CLAUDE, answer: "Something else" });
    expect(await runHookOffer(h.deps)).toBe("declined");
    expect(h.calls).not.toContain("install");
  });
});

describe("runHookOffer: failures", () => {
  it("reports a failed install without throwing", async () => {
    const h = harness({ ...WITH_CLAUDE, answer: OFFER_INSTALL, installResult: false });
    expect(await runHookOffer(h.deps)).toBe("failed");
  });

  it("logs an install that throws and does not rethrow", async () => {
    const h = harness({ ...WITH_CLAUDE, answer: OFFER_INSTALL, installThrows: true });
    expect(await runHookOffer(h.deps)).toBe("failed");
    expect(h.logs.join("\n")).toContain("disk full");
  });

  it("logs a question that cannot be shown and does not rethrow", async () => {
    const h = harness({ ...WITH_CLAUDE, askFails: true });
    expect(await runHookOffer(h.deps)).toBe("failed");
    expect(h.logs.join("\n")).toContain("no window");
  });

  it("does not ask when it cannot remember that it asked, so a read-only state never causes a nag on every start", async () => {
    const h = harness({ ...WITH_CLAUDE, markFails: true, answer: OFFER_INSTALL });
    expect(await runHookOffer(h.deps)).toBe("failed");
    expect(h.calls).not.toContain("ask");
    expect(h.logs.join("\n")).toContain("state is read-only");
  });
});
