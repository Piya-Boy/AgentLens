import { realpath } from "node:fs/promises";
import * as vscode from "vscode";
import { pathKey } from "../utils/path-key";
import type { TabController } from "./tab-controller";
import type { TabSnapshot } from "./tab-selection";
import { resolveObservableFile, showObservedFile } from "./vscode-file-opener";

export interface VscodeTab extends TabSnapshot {
  readonly tab: vscode.Tab;
}

function fileKey(tab: vscode.Tab): string | undefined {
  const { input } = tab;
  return input instanceof vscode.TabInputText && input.uri.scheme === "file" ? pathKey(input.uri.fsPath) : undefined;
}

export function listVscodeTabs(): VscodeTab[] {
  return vscode.window.tabGroups.all.flatMap((group) =>
    group.tabs.map((tab) => ({
      tab,
      key: fileKey(tab),
      isActive: tab.isActive,
      isDirty: tab.isDirty,
      isPinned: tab.isPinned,
    })),
  );
}

/** Closing a tab that turned dirty meanwhile makes VS Code ask first, so unsaved work is never discarded. */
export async function closeVscodeTabs(tabs: readonly VscodeTab[]): Promise<void> {
  await vscode.window.tabGroups.close(
    tabs.map((entry) => entry.tab),
    true,
  );
}

/** Keys for the real locations of the given files; a file that cannot be resolved keeps its own path. */
export async function realPathKeys(filePaths: readonly string[]): Promise<ReadonlySet<string>> {
  const keys = await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        return pathKey(await realpath(filePath));
      } catch {
        return pathKey(filePath);
      }
    }),
  );
  return new Set(keys);
}

/**
 * Opens a file for observation and lets the tab controller trim old tabs. A file the user
 * already had open stays theirs and is never registered as one AgentLens may close.
 */
export function createManagedOpener(tabController: TabController<VscodeTab>): (filePath: string) => Promise<void> {
  return async (filePath) => {
    const realPath = await resolveObservableFile(filePath);
    const key = pathKey(realPath);
    const alreadyOpen = listVscodeTabs().some((entry) => entry.key === key);
    await showObservedFile(realPath);
    if (!alreadyOpen) {
      tabController.trackOpened(key);
    }
    await tabController.enforce();
  };
}
