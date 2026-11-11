import { writeFileSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { deployHookScript } from "./hook-deployment";

const hooks = vi.hoisted(() => ({ beforeRename: undefined as undefined | (() => void) }));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    renameSync: (from: string, to: string): void => {
      hooks.beforeRename?.();
      actual.renameSync(from, to);
    },
  };
});

let base: string;

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), "ahr-"));
});

beforeEach(() => {
  hooks.beforeRename = undefined;
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

function refuseRename(): never {
  const error = new Error("EPERM: operation not permitted, rename") as NodeJS.ErrnoException;
  error.code = "EPERM";
  throw error;
}

describe("deployHookScript when the rename is refused", () => {
  it("counts it as done when another window already put the same script there", async () => {
    const source = path.join(base, "source-same.js");
    const target = path.join(base, "same", "hook.js");
    await writeFile(source, "hook v2");
    hooks.beforeRename = () => {
      writeFileSync(target, "hook v2");
      refuseRename();
    };

    expect(deployHookScript(source, target)).toBe("unchanged");

    expect(await readFile(target, "utf8")).toBe("hook v2");
    expect(await readdir(path.dirname(target))).toEqual(["hook.js"]);
  });

  it("reports the failure when the target still holds something else", async () => {
    const source = path.join(base, "source-other.js");
    const target = path.join(base, "other", "hook.js");
    await writeFile(source, "hook v2");
    hooks.beforeRename = () => {
      writeFileSync(target, "hook v1");
      refuseRename();
    };

    expect(() => deployHookScript(source, target)).toThrow("EPERM");

    expect(await readFile(target, "utf8")).toBe("hook v1");
    expect(await readdir(path.dirname(target))).toEqual(["hook.js"]);
  });
});
