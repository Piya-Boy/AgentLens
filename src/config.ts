import * as vscode from "vscode";

export interface AgentLensConfig {
  readonly autoFocus: boolean;
  readonly maxTabs: number;
  readonly focusCooldownMs: number;
  readonly ignoredFolders: readonly string[];
}

export const DEFAULT_IGNORED_FOLDERS: readonly string[] = [".git", "node_modules"];

export function readConfig(): AgentLensConfig {
  const section = vscode.workspace.getConfiguration("agentlens");
  return {
    autoFocus: section.get<boolean>("autoFocus", true),
    maxTabs: section.get<number>("maxTabs", 5),
    focusCooldownMs: Math.max(0, section.get<number>("focusCooldownMs", 1000)),
    ignoredFolders: section
      .get<unknown[]>("ignoredFolders", [...DEFAULT_IGNORED_FOLDERS])
      .filter((entry): entry is string => typeof entry === "string"),
  };
}
