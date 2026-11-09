import { spawn } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { endpointForRoot, type EndpointEnvironment } from "../transport/endpoint";
import { loadOrCreateSecret, secretFilePath } from "../transport/endpoint-secret";
import { IpcServer } from "../transport/ipc-server";

interface Machine {
  readonly home: string;
  readonly runtimeDir: string;
}

let base: string;
let hookScript: string;
let machineCount = 0;
const servers: IpcServer[] = [];

beforeAll(async () => {
  base = await realpath(await mkdtemp(path.join(tmpdir(), "ah-")));
  hookScript = path.join(base, "hook.js");
  await build({
    entryPoints: [path.resolve("src", "hook", "claude-hook.ts")],
    outfile: hookScript,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    logLevel: "silent",
  });
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

async function newMachine(): Promise<Machine> {
  machineCount += 1;
  const home = path.join(base, `m${String(machineCount)}`);
  const runtimeDir = path.join(home, "r");
  await mkdir(runtimeDir, { recursive: true, mode: 0o700 });
  return { home, runtimeDir };
}

function secretFile(machine: Machine): string {
  return secretFilePath({
    platform: process.platform,
    homeDir: machine.home,
    localAppData: machine.home,
    xdgStateHome: machine.home,
  });
}

function hookEnvironment(machine: Machine): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: machine.home,
    USERPROFILE: machine.home,
    LOCALAPPDATA: machine.home,
    XDG_STATE_HOME: machine.home,
    XDG_RUNTIME_DIR: machine.runtimeDir,
  };
}

function endpointEnvironment(machine: Machine, secret: string): EndpointEnvironment {
  return {
    platform: process.platform,
    runtimeDir: machine.runtimeDir,
    uid: typeof process.getuid === "function" ? process.getuid() : 0,
    secret,
  };
}

async function newWorkspace(machine: Machine): Promise<string> {
  const root = path.join(machine.home, "ws");
  await mkdir(path.join(root, "src", "deep"), { recursive: true });
  return realpath(root);
}

async function listen(machine: Machine, root: string, secret: string) {
  const onMessage = vi.fn();
  const reportError = vi.fn();
  servers.push(
    await IpcServer.listen(endpointForRoot(root, endpointEnvironment(machine, secret)), { onMessage, reportError }),
  );
  return { onMessage, reportError };
}

function payload(cwd: string, filePath: string): string {
  return JSON.stringify({
    hook_event_name: "PreToolUse",
    session_id: "s-process",
    tool_use_id: "t-1",
    tool_name: "Write",
    cwd,
    tool_input: { file_path: filePath, content: "TOP SECRET CONTENT" },
  });
}

function runHook(machine: Machine, stdin: string): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [hookScript, "--agentlens"], {
      env: hookEnvironment(machine),
      stdio: ["pipe", "pipe", "ignore"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout });
    });
    child.stdin.end(stdin);
  });
}

async function waitUntil(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error("condition not met in time");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("dist/hook.js as a separate process", () => {
  it("delivers only the tool, session and path to the window that listens for the workspace, and prints nothing", async () => {
    const machine = await newMachine();
    const secret = loadOrCreateSecret(secretFile(machine));
    const root = await newWorkspace(machine);
    const { onMessage } = await listen(machine, root, secret);
    const target = path.join(root, "src", "a.ts");

    const result = await runHook(machine, payload(root, target));

    expect(result).toEqual({ code: 0, stdout: "" });
    await waitUntil(() => onMessage.mock.calls.length > 0);
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ tool_name: "Write", session_id: "s-process", tool_input: { file_path: target } }),
    );
    expect(JSON.stringify(onMessage.mock.calls)).not.toContain("TOP SECRET");
  });

  it("finds the window of a parent folder when the agent runs in a subfolder", async () => {
    const machine = await newMachine();
    const secret = loadOrCreateSecret(secretFile(machine));
    const root = await newWorkspace(machine);
    const { onMessage } = await listen(machine, root, secret);

    const result = await runHook(machine, payload(path.join(root, "src", "deep"), path.join(root, "src", "deep", "b.ts")));

    expect(result.code).toBe(0);
    await waitUntil(() => onMessage.mock.calls.length > 0);
  });

  it("sends nothing when the user has no endpoint secret", async () => {
    const machine = await newMachine();
    const root = await newWorkspace(machine);
    const { onMessage } = await listen(machine, root, "a".repeat(64));

    const result = await runHook(machine, payload(root, path.join(root, "src", "a.ts")));

    expect(result).toEqual({ code: 0, stdout: "" });
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("does not reach a listener that was started under a different secret", async () => {
    const machine = await newMachine();
    loadOrCreateSecret(secretFile(machine));
    const root = await newWorkspace(machine);
    const { onMessage } = await listen(machine, root, "e".repeat(64));

    const result = await runHook(machine, payload(root, path.join(root, "src", "a.ts")));

    expect(result).toEqual({ code: 0, stdout: "" });
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("exits 0 without output for input it cannot read", async () => {
    const machine = await newMachine();
    loadOrCreateSecret(secretFile(machine));

    expect(await runHook(machine, "not json")).toEqual({ code: 0, stdout: "" });
    expect(await runHook(machine, "")).toEqual({ code: 0, stdout: "" });
  });
});
