import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import type { AgentFileEvent } from "../models/agent-file-event";
import { KeyedDebouncer } from "../utils/keyed-debouncer";
import { workspaceRoots } from "../workspace";
import { createFilesystemEvent, isIgnoredPath, type FilesystemChangeKind } from "./filesystem-event";

export const FILESYSTEM_DEBOUNCE_MS = 200;

export interface FilesystemDetectorOptions {
  readonly emit: (event: AgentFileEvent) => void;
  readonly getIgnoredFolders: () => readonly string[];
  readonly reportError: (error: unknown) => void;
}

export class FilesystemDetector implements vscode.Disposable {
  private readonly watcher = vscode.workspace.createFileSystemWatcher("**/*");
  private readonly debouncer = new KeyedDebouncer(FILESYSTEM_DEBOUNCE_MS);
  private readonly subscriptions: vscode.Disposable[];

  constructor(private readonly options: FilesystemDetectorOptions) {
    this.subscriptions = [
      this.watcher,
      this.watcher.onDidCreate((uri) => {
        this.observe("create", uri);
      }),
      this.watcher.onDidChange((uri) => {
        this.observe("change", uri);
      }),
      this.watcher.onDidDelete((uri) => {
        this.observe("delete", uri);
      }),
    ];
  }

  dispose(): void {
    this.debouncer.dispose();
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
  }

  private observe(kind: FilesystemChangeKind, uri: vscode.Uri): void {
    if (uri.scheme !== "file") {
      return;
    }
    const filePath = uri.fsPath;
    if (isIgnoredPath(filePath, workspaceRoots(), this.options.getIgnoredFolders())) {
      return;
    }
    this.debouncer.schedule(`${kind}\0${filePath}`, () => {
      this.emitObservation(kind, uri).catch((error: unknown) => {
        this.options.reportError(error);
      });
    });
  }

  private async emitObservation(kind: FilesystemChangeKind, uri: vscode.Uri): Promise<void> {
    if (kind !== "delete" && !(await this.isExistingFile(uri))) {
      return;
    }
    this.options.emit(createFilesystemEvent(kind, uri.fsPath, Date.now(), randomUUID()));
  }

  private async isExistingFile(uri: vscode.Uri): Promise<boolean> {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      return (stat.type & vscode.FileType.Directory) === 0;
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === "FileNotFound") {
        return false;
      }
      throw error;
    }
  }
}
