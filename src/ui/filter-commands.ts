import * as vscode from "vscode";
import {
  distinctValues,
  parseFilterArgs,
  type ActivityFilter,
  type ActivityFilterState,
  type FilterDimension,
} from "../core/activity-filter";
import type { ActivityStore } from "../core/activity-store";

interface DimensionChoice extends vscode.QuickPickItem {
  readonly dimension: FilterDimension;
}

const DIMENSIONS: readonly DimensionChoice[] = [
  { label: "Agent", dimension: "agentId" },
  { label: "Session", dimension: "sessionId" },
  { label: "Action", dimension: "action" },
];

async function pickFilter(store: ActivityStore, current: ActivityFilter): Promise<ActivityFilter | undefined> {
  const choice = await vscode.window.showQuickPick(DIMENSIONS, { placeHolder: "Filter activity by..." });
  if (choice === undefined) {
    return undefined;
  }
  const values = distinctValues(store.list(), choice.dimension);
  if (values.length === 0) {
    void vscode.window.showInformationMessage("AgentLens: no activity to filter yet.");
    return undefined;
  }
  const value = await vscode.window.showQuickPick(values, { placeHolder: `${choice.label}...` });
  if (value === undefined) {
    return undefined;
  }
  return parseFilterArgs({ ...current, [choice.dimension]: value });
}

export function registerFilterCommands(store: ActivityStore, filterState: ActivityFilterState): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand("agentlens.filterActivity", async (args?: unknown) => {
      const next =
        args === undefined ? await pickFilter(store, filterState.filter) : parseFilterArgs(args);
      if (next === undefined) {
        if (args !== undefined) {
          void vscode.window.showWarningMessage("AgentLens: invalid activity filter.");
        }
        return;
      }
      filterState.set(next);
    }),
    vscode.commands.registerCommand("agentlens.clearActivityFilter", () => {
      filterState.clear();
    }),
  ];
}
