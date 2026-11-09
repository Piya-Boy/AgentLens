import { realpath } from "node:fs/promises";
import * as os from "node:os";
import * as vscode from "vscode";
import { workspaceRoots } from "../workspace";
import { endpointForRoot, type EndpointEnvironment } from "./endpoint";
import { loadOrCreateSecret, secretFilePath } from "./endpoint-secret";
import { IpcServer } from "./ipc-server";

export interface HookListenerOptions {
  readonly onMessage: (message: unknown) => void;
  readonly reportError: (error: unknown) => void;
}

function endpointEnvironment(): EndpointEnvironment {
  const secret = loadOrCreateSecret(
    secretFilePath({
      platform: process.platform,
      homeDir: os.homedir(),
      localAppData: process.env.LOCALAPPDATA,
      xdgStateHome: process.env.XDG_STATE_HOME,
    }),
  );
  return {
    platform: process.platform,
    runtimeDir: process.env.XDG_RUNTIME_DIR ?? os.tmpdir(),
    uid: typeof process.getuid === "function" ? process.getuid() : 0,
    secret,
  };
}

export class HookListener implements vscode.Disposable {
  private readonly servers = new Map<string, IpcServer>();
  private readonly folderSubscription: vscode.Disposable;
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(private readonly options: HookListenerOptions) {
    this.folderSubscription = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.sync();
    });
    this.sync();
  }

  endpoints(): readonly string[] {
    return [...this.servers.keys()];
  }

  dispose(): void {
    this.disposed = true;
    this.folderSubscription.dispose();
    this.queue = this.queue.then(async () => {
      const servers = [...this.servers.values()];
      this.servers.clear();
      await Promise.all(servers.map((server) => server.dispose()));
    });
    this.queue.catch(this.options.reportError);
  }

  private sync(): void {
    this.queue = this.queue.then(() => this.reconcile());
    this.queue.catch(this.options.reportError);
  }

  private async desiredEndpoints(): Promise<Set<string>> {
    let environment: EndpointEnvironment;
    try {
      environment = endpointEnvironment();
    } catch (error) {
      this.options.reportError(error);
      return new Set();
    }
    const results = await Promise.allSettled(workspaceRoots().map((root) => realpath(root)));
    const endpoints = new Set<string>();
    for (const result of results) {
      if (result.status === "fulfilled") {
        endpoints.add(endpointForRoot(result.value, environment));
      } else {
        this.options.reportError(result.reason);
      }
    }
    return endpoints;
  }

  private async reconcile(): Promise<void> {
    if (this.disposed) {
      return;
    }
    const desired = await this.desiredEndpoints();

    for (const [endpoint, server] of [...this.servers]) {
      if (!desired.has(endpoint)) {
        this.servers.delete(endpoint);
        await server.dispose();
      }
    }
    for (const endpoint of desired) {
      if (this.servers.has(endpoint)) {
        continue;
      }
      try {
        this.servers.set(endpoint, await IpcServer.listen(endpoint, this.options));
      } catch (error) {
        this.options.reportError(error);
      }
    }
  }
}
