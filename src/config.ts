import * as vscode from "vscode";

export interface AgentLensConfig {
  readonly autoFocus: boolean;
  readonly maxTabs: number;
}

export function readConfig(): AgentLensConfig {
  const section = vscode.workspace.getConfiguration("agentlens");
  return {
    autoFocus: section.get<boolean>("autoFocus", true),
    maxTabs: section.get<number>("maxTabs", 5),
  };
}
