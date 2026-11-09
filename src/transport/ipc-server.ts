import { chmod, lstat, mkdir, unlink } from "node:fs/promises";
import * as net from "node:net";
import nodePath from "node:path";
import { MAX_FORWARD_BYTES } from "../hook/forward-message";

/** Absolute time a connection may stay open; it is not extended by incoming bytes. */
export const CONNECTION_TIMEOUT_MS = 2000;

export const MAX_CONNECTIONS = 16;

export interface IpcServerOptions {
  readonly onMessage: (message: unknown) => void;
  readonly reportError: (error: unknown) => void;
  readonly connectionTimeoutMs?: number;
  readonly maxConnections?: number;
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function prepareSocketDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stats = await lstat(directory);
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error("socket directory is not a plain directory");
  }
  if (uid !== undefined && stats.uid !== uid) {
    throw new Error("socket directory is owned by another user");
  }
  if ((stats.mode & 0o077) !== 0) {
    throw new Error("socket directory must not be accessible by group or others");
  }
}

function isAlive(endpoint: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection(endpoint);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      resolve(false);
    });
  });
}

function listenOnce(server: net.Server, endpoint: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error): void => {
      reject(error);
    };
    server.once("error", onError);
    server.listen(endpoint, () => {
      server.off("error", onError);
      resolve();
    });
  });
}

export class IpcServer {
  private readonly sockets = new Set<net.Socket>();

  private constructor(
    private readonly server: net.Server,
    private readonly endpoint: string,
    private readonly usesSocketFile: boolean,
  ) {}

  static async listen(endpoint: string, options: IpcServerOptions): Promise<IpcServer> {
    const usesSocketFile = process.platform !== "win32";
    if (usesSocketFile) {
      await prepareSocketDirectory(nodePath.dirname(endpoint));
    }

    const server = net.createServer();
    server.maxConnections = options.maxConnections ?? MAX_CONNECTIONS;
    const instance = new IpcServer(server, endpoint, usesSocketFile);
    server.on("connection", (socket) => {
      instance.handleConnection(socket, options);
    });
    server.on("error", options.reportError);

    try {
      await listenOnce(server, endpoint);
    } catch (error) {
      if (!usesSocketFile || !isErrnoException(error) || error.code !== "EADDRINUSE") {
        throw error;
      }
      if (await isAlive(endpoint)) {
        throw new Error("endpoint is already served by another AgentLens instance", { cause: error });
      }
      await unlink(endpoint);
      await listenOnce(server, endpoint);
    }

    if (usesSocketFile) {
      await chmod(endpoint, 0o600);
    }
    return instance;
  }

  async dispose(): Promise<void> {
    for (const socket of this.sockets) {
      socket.destroy();
    }
    await new Promise<void>((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
    if (this.usesSocketFile) {
      await unlink(this.endpoint).catch((error: unknown) => {
        if (!isErrnoException(error) || error.code !== "ENOENT") {
          throw error;
        }
      });
    }
  }

  private handleConnection(socket: net.Socket, options: IpcServerOptions): void {
    this.sockets.add(socket);
    const deadline = setTimeout(() => {
      socket.destroy();
    }, options.connectionTimeoutMs ?? CONNECTION_TIMEOUT_MS);
    socket.on("close", () => {
      clearTimeout(deadline);
      this.sockets.delete(socket);
    });
    socket.on("error", options.reportError);

    const chunks: Buffer[] = [];
    let size = 0;
    let rejected = false;
    socket.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_FORWARD_BYTES) {
        rejected = true;
        socket.destroy();
        options.reportError(new Error("message exceeds the size limit"));
        return;
      }
      chunks.push(chunk);
    });
    socket.on("end", () => {
      if (rejected) {
        return;
      }
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (text.length === 0) {
        return;
      }
      try {
        options.onMessage(JSON.parse(text));
      } catch (error) {
        options.reportError(error);
      }
    });
  }
}
