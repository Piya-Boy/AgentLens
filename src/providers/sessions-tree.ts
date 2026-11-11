import * as vscode from "vscode";
import { describeSession, type TimeFormatter } from "../core/activity-format";
import type { SessionInfo, SessionManager } from "../core/session-manager";
import { defaultTimeFormatter } from "./activity-tree";

export class SessionsTreeProvider implements vscode.TreeDataProvider<SessionInfo>, vscode.Disposable {
  private readonly changed = new vscode.EventEmitter<void>();
  private readonly subscription: { dispose(): void };

  readonly onDidChangeTreeData = this.changed.event;

  constructor(
    private readonly sessions: SessionManager,
    private readonly formatTime: TimeFormatter = defaultTimeFormatter,
  ) {
    this.subscription = sessions.onDidChange(() => {
      this.changed.fire();
    });
  }

  getChildren(): SessionInfo[] {
    return [...this.sessions.list()];
  }

  getTreeItem(session: SessionInfo): vscode.TreeItem {
    const description = describeSession(session, this.formatTime);
    const item = new vscode.TreeItem(description.label, vscode.TreeItemCollapsibleState.None);
    item.id = `${session.agentId}:${session.sessionId}`;
    item.description = description.description;
    item.tooltip = description.tooltip;
    item.iconPath = new vscode.ThemeIcon("account");
    return item;
  }

  dispose(): void {
    this.subscription.dispose();
    this.changed.dispose();
  }
}
