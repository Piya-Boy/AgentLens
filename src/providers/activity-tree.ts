import * as vscode from "vscode";
import { describeEvent, type TimeFormatter } from "../core/activity-format";
import type { ActivityStore } from "../core/activity-store";
import type { AgentFileEvent } from "../models/agent-file-event";

export const defaultTimeFormatter: TimeFormatter = (timestamp) => new Date(timestamp).toLocaleTimeString();

export class ActivityTreeProvider implements vscode.TreeDataProvider<AgentFileEvent>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  private readonly subscription: { dispose(): void };

  readonly onDidChangeTreeData = this.changed.event;

  constructor(
    private readonly store: ActivityStore,
    private readonly formatTime: TimeFormatter = defaultTimeFormatter,
  ) {
    this.subscription = store.onDidChange(() => {
      this.changed.fire();
    });
  }

  getChildren(): AgentFileEvent[] {
    return [...this.store.list()];
  }

  getTreeItem(event: AgentFileEvent): vscode.TreeItem {
    const description = describeEvent(event, this.formatTime);
    const item = new vscode.TreeItem(description.label, vscode.TreeItemCollapsibleState.None);
    item.id = `${event.agentId}:${event.sessionId}:${event.eventId}`;
    item.description = description.description;
    item.tooltip = description.tooltip;
    item.iconPath = new vscode.ThemeIcon(event.source === "filesystem" ? "eye" : "zap");
    if (event.action !== "delete") {
      item.command = {
        command: "vscode.open",
        title: "Open File",
        arguments: [vscode.Uri.file(event.filePath)],
      };
    }
    return item;
  }

  dispose(): void {
    this.subscription.dispose();
    this.changed.dispose();
  }
}
