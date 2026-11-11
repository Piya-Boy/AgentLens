import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

interface Manifest {
  readonly name?: unknown;
  readonly publisher?: unknown;
  readonly displayName?: unknown;
  readonly activationEvents?: unknown;
}

function readManifest(): Manifest {
  return JSON.parse(readFileSync(path.resolve("package.json"), "utf8")) as Manifest;
}

describe("package.json", () => {
  it("activates the extension when VS Code has started, not only when its view or a command is used", () => {
    expect(readManifest().activationEvents).toEqual(["onStartupFinished"]);
  });

  it("does not use the name or display name `agentlens`, which the Marketplace refused because another extension has them", () => {
    const manifest = readManifest();

    expect(`${String(manifest.publisher)}.${String(manifest.name)}`).toBe("piya-boy.agentlens-file-monitor");
    expect(manifest.displayName).toBe("AgentLens File Monitor");
  });
});
