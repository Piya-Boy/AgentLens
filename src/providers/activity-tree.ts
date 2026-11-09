import * as vscode from "vscode";
import { describeEvent, type TimeFormatter } from "../core/activity-format";
import { filterActivity, type ActivityFilterState } from "../core/activity-filter";
import type { ActivityStore } from "../core/activity-store";
import type { AgentFileEvent } from "../models/agent-file-event";

export const defaultTimeFormatter: TimeFormatter = (timestamp) => new Date(timestamp).toLocaleTimeString();

export class ActivityTreeProvider implements vscode.TreeDataProvider<AgentFileEvent>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  private readonly subscriptions: { dispose(): void }[];

  readonly onDidChangeTreeData = this.changed.event;

  constructor(
    private readonly store: ActivityStore,
    private readonly filterState: ActivityFilterState,
    private readonly formatTime: TimeFormatter = defaultTimeFormatter,
  ) {
    const refresh = (): void => {
      this.changed.fire();
    };
    this.subscriptions = [store.onDidChange(refresh), filterState.onDidChange(refresh)];
  }

  getChildren(): AgentFileEvent[] {
    return filterActivity(this.store.list(), this.filterState.filter);
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
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
    this.changed.dispose();
  }
}
