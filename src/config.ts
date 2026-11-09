import * as vscode from "vscode";
import { DEFAULT_FOCUS_MODE, parseFocusMode, type FocusMode } from "./controllers/focus-controller";

export interface AgentLensConfig {
  readonly focusMode: FocusMode;
  readonly maxTabs: number;
  readonly focusCooldownMs: number;
  readonly ignoredFolders: readonly string[];
}

export const DEFAULT_IGNORED_FOLDERS: readonly string[] = [".git", "node_modules"];

export function readConfig(): AgentLensConfig {
  const section = vscode.workspace.getConfiguration("agentlens");
  return {
    focusMode: parseFocusMode(section.get<unknown>("focusMode", DEFAULT_FOCUS_MODE)),
    maxTabs: section.get<number>("maxTabs", 5),
    focusCooldownMs: Math.max(0, section.get<number>("focusCooldownMs", 1000)),
    ignoredFolders: section
      .get<unknown[]>("ignoredFolders", [...DEFAULT_IGNORED_FOLDERS])
      .filter((entry): entry is string => typeof entry === "string"),
  };
}
