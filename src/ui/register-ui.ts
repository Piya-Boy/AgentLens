import * as vscode from "vscode";
import { describeFilter, isFilterActive, type ActivityFilterState } from "../core/activity-filter";
import { describeStatus } from "../core/activity-format";
import type { ActivityStore } from "../core/activity-store";
import type { EnabledState } from "../core/enabled-state";
import type { PauseState } from "../core/pause-state";
import type { SessionManager } from "../core/session-manager";
import { ActivityTreeProvider } from "../providers/activity-tree";
import { SessionsTreeProvider } from "../providers/sessions-tree";
import { registerFilterCommands } from "./filter-commands";

export const SHOW_VIEW_COMMAND = "workbench.view.extension.agentlens";

export interface UiDependencies {
  readonly activityStore: ActivityStore;
  readonly filterState: ActivityFilterState;
  readonly sessionManager: SessionManager;
  readonly enabledState: EnabledState;
  readonly pauseState: PauseState;
}

export function registerUi(dependencies: UiDependencies): vscode.Disposable[] {
  const { activityStore, filterState, sessionManager, enabledState, pauseState } = dependencies;

  const activityProvider = new ActivityTreeProvider(activityStore, filterState);
  const activityView = vscode.window.createTreeView("agentlens.activity", { treeDataProvider: activityProvider });
  const sessionsProvider = new SessionsTreeProvider(sessionManager);

  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);
  statusBar.command = SHOW_VIEW_COMMAND;
  const refreshStatus = (): void => {
    const status = describeStatus(enabledState.isEnabled, pauseState.isPaused);
    statusBar.text = status.text;
    statusBar.tooltip = status.tooltip;
  };
  refreshStatus();
  statusBar.show();

  const refreshFilter = (): void => {
    const active = isFilterActive(filterState.filter);
    activityView.description = active ? describeFilter(filterState.filter) : undefined;
    void vscode.commands.executeCommand("setContext", "agentlens.filterActive", active);
  };
  refreshFilter();

  return [
    activityProvider,
    sessionsProvider,
    activityView,
    vscode.window.registerTreeDataProvider("agentlens.sessions", sessionsProvider),
    statusBar,
    enabledState.onDidChange(refreshStatus),
    pauseState.onDidChange(refreshStatus),
    filterState.onDidChange(refreshFilter),
    ...registerFilterCommands(activityStore, filterState),
  ];
}
