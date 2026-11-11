import { randomUUID } from "node:crypto";
import { chmod, mkdir, mkdtemp, rm, stat, symlink } from "node:fs/promises";
import * as net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { MAX_FORWARD_BYTES } from "../hook/forward-message";
import { endpointForRoot } from "./endpoint";
import { IpcServer } from "./ipc-server";

let runtimeDir: string;
const servers: IpcServer[] = [];

beforeAll(async () => {
  runtimeDir = await mkdtemp(path.join(tmpdir(), "agentlens-ipc-"));
});

afterAll(async () => {
  await rm(runtimeDir, { recursive: true, force: true });
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.dispose()));
});

function newEndpoint(): string {
  return endpointForRoot(`/test-root/${randomUUID()}`, {
    platform: process.platform,
    runtimeDir,
    uid: typeof process.getuid === "function" ? process.getuid() : 0,
    secret: "b".repeat(64),
  });
}

/** An endpoint whose socket directory no other test shares, so a test can damage it. */
async function isolatedEndpoint(): Promise<{ endpoint: string; directory: string }> {
  const isolated = await mkdtemp(path.join(runtimeDir, "iso-"));
  const endpoint = endpointForRoot(`/test-root/${randomUUID()}`, {
    platform: process.platform,
    runtimeDir: isolated,
    uid: typeof process.getuid === "function" ? process.getuid() : 0,
    secret: "b".repeat(64),
  });
  return { endpoint, directory: path.dirname(endpoint) };
}

async function startServer(endpoint: string) {
  const onMessage = vi.fn();
  const reportError = vi.fn();
  const server = await IpcServer.listen(endpoint, { onMessage, reportError });
  servers.push(server);
  return { server, onMessage, reportError };
}

function sendRaw(endpoint: string, data: string | Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint);
    socket.on("error", () => {
      resolve();
    });
    socket.on("close", () => {
      resolve();
    });
    socket.on("connect", () => {
      socket.write(data, (error) => {
        if (error) {
          reject(error);
          return;
        }
        socket.end();
      });
    });
  });
}

function waitUntil(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = (): void => {
      if (condition()) {
        resolve();
      } else if (Date.now() > deadline) {
        reject(new Error("timed out"));
      } else {
        setTimeout(tick, 20);
      }
    };
    tick();
  });
}

describe("IpcServer", () => {
  it("delivers a JSON message", async () => {
    const endpoint = newEndpoint();
    const { onMessage } = await startServer(endpoint);

    await sendRaw(endpoint, `${JSON.stringify({ hello: "world" })}\n`);
    await waitUntil(() => onMessage.mock.calls.length > 0);

    expect(onMessage).toHaveBeenCalledExactlyOnceWith({ hello: "world" });
  });

  it("reports invalid JSON without delivering it", async () => {
    const endpoint = newEndpoint();
    const { onMessage, reportError } = await startServer(endpoint);

    await sendRaw(endpoint, "not json\n");
    await waitUntil(() => reportError.mock.calls.length > 0);

    expect(onMessage).not.toHaveBeenCalled();
  });

  it("ignores an empty connection", async () => {
    const endpoint = newEndpoint();
    const { onMessage, reportError } = await startServer(endpoint);

    await sendRaw(endpoint, "");
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(onMessage).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("drops messages above the size limit", async () => {
    const endpoint = newEndpoint();
    const { onMessage, reportError } = await startServer(endpoint);

    await sendRaw(endpoint, Buffer.alloc(MAX_FORWARD_BYTES + 1024, "a"));
    await waitUntil(() => reportError.mock.calls.length > 0);

    expect(onMessage).not.toHaveBeenCalled();
  });

  it("keeps serving after a bad client", async () => {
    const endpoint = newEndpoint();
    const { onMessage, reportError } = await startServer(endpoint);

    await sendRaw(endpoint, "garbage\n");
    await waitUntil(() => reportError.mock.calls.length > 0);
    await sendRaw(endpoint, `${JSON.stringify({ ok: true })}\n`);
    await waitUntil(() => onMessage.mock.calls.length > 0);

    expect(onMessage).toHaveBeenCalledExactlyOnceWith({ ok: true });
  });

  it("isolates a throwing message handler", async () => {
    const endpoint = newEndpoint();
    const failure = new Error("handler failed");
    const reportError = vi.fn();
    const server = await IpcServer.listen(endpoint, {
      onMessage: () => {
        throw failure;
      },
      reportError,
    });
    servers.push(server);

    await sendRaw(endpoint, `${JSON.stringify({ a: 1 })}\n`);
    await waitUntil(() => reportError.mock.calls.length > 0);

    expect(reportError).toHaveBeenCalledExactlyOnceWith(failure);
  });

  it("stops accepting connections after dispose", async () => {
    const endpoint = newEndpoint();
    const { server, onMessage } = await startServer(endpoint);
    await server.dispose();
    servers.pop();

    await sendRaw(endpoint, `${JSON.stringify({ late: true })}\n`);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(onMessage).not.toHaveBeenCalled();
  });

  it.skipIf(process.platform === "win32")("creates the socket with owner-only permissions", async () => {
    const endpoint = newEndpoint();
    await startServer(endpoint);
    const directoryMode = (await stat(path.dirname(endpoint))).mode & 0o777;
    const socketMode = (await stat(endpoint)).mode & 0o777;
    expect(directoryMode).toBe(0o700);
    expect(socketMode & 0o077).toBe(0);
  });

  it.skipIf(process.platform === "win32")("refuses a socket directory that group or others can access", async () => {
    const { endpoint, directory } = await isolatedEndpoint();
    await mkdir(directory, { recursive: true });
    await chmod(directory, 0o755);

    await expect(IpcServer.listen(endpoint, { onMessage: vi.fn(), reportError: vi.fn() })).rejects.toThrow(
      /must not be accessible/,
    );
  });

  it.skipIf(process.platform === "win32")("refuses a socket directory that is a symbolic link", async () => {
    const { endpoint, directory } = await isolatedEndpoint();
    const elsewhere = await mkdtemp(path.join(runtimeDir, "elsewhere-"));
    await chmod(elsewhere, 0o700);
    await symlink(elsewhere, directory);

    await expect(IpcServer.listen(endpoint, { onMessage: vi.fn(), reportError: vi.fn() })).rejects.toThrow(
      /not a plain directory/,
    );
  });

  it("refuses to take over an endpoint that is served by a live instance", async () => {
    const endpoint = newEndpoint();
    await startServer(endpoint);

    await expect(IpcServer.listen(endpoint, { onMessage: vi.fn(), reportError: vi.fn() })).rejects.toThrow();
  });
});

describe("IpcServer connection limits", () => {
  function openIdle(endpoint: string): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(endpoint);
      socket.on("error", () => undefined);
      socket.once("connect", () => {
        resolve(socket);
      });
      socket.once("error", reject);
    });
  }

  function closed(socket: net.Socket): Promise<void> {
    return new Promise((resolve) => {
      if (socket.destroyed) {
        resolve();
        return;
      }
      socket.once("close", () => {
        resolve();
      });
    });
  }

  it("closes a connection at the deadline even when bytes keep arriving", async () => {
    const endpoint = newEndpoint();
    const reportError = vi.fn();
    servers.push(await IpcServer.listen(endpoint, { onMessage: vi.fn(), reportError, connectionTimeoutMs: 300 }));
    const socket = await openIdle(endpoint);
    const started = Date.now();
    const drip = setInterval(() => {
      if (!socket.destroyed) {
        socket.write("x");
      }
    }, 50);

    await closed(socket);
    clearInterval(drip);

    expect(Date.now() - started).toBeLessThan(1500);
  });

  it("drops connections beyond the limit and serves again once they close", async () => {
    const endpoint = newEndpoint();
    const onMessage = vi.fn();
    servers.push(await IpcServer.listen(endpoint, { onMessage, reportError: vi.fn(), maxConnections: 2 }));
    const held = [await openIdle(endpoint), await openIdle(endpoint)];

    const extra = await openIdle(endpoint);
    await closed(extra);
    expect(held.every((socket) => !socket.destroyed)).toBe(true);

    for (const socket of held) {
      socket.destroy();
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
    await sendRaw(endpoint, `${JSON.stringify({ again: true })}\n`);
    await waitUntil(() => onMessage.mock.calls.length > 0);

    expect(onMessage).toHaveBeenCalledExactlyOnceWith({ again: true });
  });
});
