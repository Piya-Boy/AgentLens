import * as vscode from "vscode";
import { describeStatus } from "../core/activity-format";
import type { ActivityStore } from "../core/activity-store";
import type { EnabledState } from "../core/enabled-state";
import type { PauseState } from "../core/pause-state";
import type { SessionManager } from "../core/session-manager";
import { ActivityTreeProvider } from "../providers/activity-tree";
import { SessionsTreeProvider } from "../providers/sessions-tree";

export const SHOW_VIEW_COMMAND = "workbench.view.extension.agentlens";

export interface UiDependencies {
  readonly activityStore: ActivityStore;
  readonly sessionManager: SessionManager;
  readonly enabledState: EnabledState;
  readonly pauseState: PauseState;
}

export function registerUi(dependencies: UiDependencies): vscode.Disposable[] {
  const { activityStore, sessionManager, enabledState, pauseState } = dependencies;

  const activityProvider = new ActivityTreeProvider(activityStore);
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

  return [
    activityProvider,
    sessionsProvider,
    vscode.window.registerTreeDataProvider("agentlens.activity", activityProvider),
    vscode.window.registerTreeDataProvider("agentlens.sessions", sessionsProvider),
    statusBar,
    enabledState.onDidChange(refreshStatus),
    pauseState.onDidChange(refreshStatus),
  ];
}
