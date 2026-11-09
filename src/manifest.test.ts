import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

interface Manifest {
  readonly activationEvents?: unknown;
}

describe("package.json", () => {
  it("activates the extension when VS Code has started, not only when its view or a command is used", () => {
    const manifest = JSON.parse(readFileSync(path.resolve("package.json"), "utf8")) as Manifest;

    expect(manifest.activationEvents).toEqual(["onStartupFinished"]);
  });
});
