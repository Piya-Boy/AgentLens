import { realpathSync } from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import { directoryChain, endpointForRoot, type EndpointEnvironment } from "../transport/endpoint";
import { buildForwardMessage, type ForwardMessage } from "./forward-message";

const CONNECT_TIMEOUT_MS = 300;
const HARD_TIMEOUT_MS = 2000;

function environment(): EndpointEnvironment {
  return {
    platform: process.platform,
    runtimeDir: process.env.XDG_RUNTIME_DIR ?? os.tmpdir(),
    uid: typeof process.getuid === "function" ? process.getuid() : 0,
  };
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    process.stdin.on("error", () => {
      resolve("");
    });
  });
}

function send(endpoint: string, message: ForwardMessage): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection(endpoint);
    const finish = (delivered: boolean): void => {
      socket.destroy();
      resolve(delivered);
    };
    socket.setTimeout(CONNECT_TIMEOUT_MS, () => {
      finish(false);
    });
    socket.on("error", () => {
      finish(false);
    });
    socket.on("connect", () => {
      socket.end(`${JSON.stringify(message)}\n`, () => {
        finish(true);
      });
    });
  });
}

async function forward(message: ForwardMessage): Promise<void> {
  let realCwd: string;
  try {
    realCwd = realpathSync.native(message.cwd);
  } catch {
    return;
  }
  const env = environment();
  for (const directory of directoryChain(realCwd)) {
    if (await send(endpointForRoot(directory, env), message)) {
      return;
    }
  }
}

/**
 * Notify-only hook: it never writes to stdout and always exits 0, so Claude Code's
 * permission flow is unchanged and a missing or slow VS Code never blocks a tool call.
 */
async function main(): Promise<void> {
  const guard = setTimeout(() => {
    process.exit(0);
  }, HARD_TIMEOUT_MS);
  const message = buildForwardMessage(await readStdin());
  if (message !== undefined) {
    await forward(message);
  }
  clearTimeout(guard);
  process.exit(0);
}

void main();
