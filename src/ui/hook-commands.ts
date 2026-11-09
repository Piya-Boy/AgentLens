import nodePath from "node:path";
import * as vscode from "vscode";
import { installHook, uninstallHook, type InstallResult } from "../adapters/claude/hook-installer";
import { buildHookCommand } from "../adapters/claude/hook-settings";

const CONFIRM_INSTALL = "Install";
const CONFIRM_UNINSTALL = "Remove";

function settingsPathForWorkspace(): string | undefined {
  const folder = vscode.workspace.workspaceFolders?.find((candidate) => candidate.uri.scheme === "file");
  return folder === undefined ? undefined : nodePath.join(folder.uri.fsPath, ".claude", "settings.local.json");
}

async function confirm(message: string, detail: string, action: string): Promise<boolean> {
  const choice = await vscode.window.showInformationMessage(message, { modal: true, detail }, action);
  return choice === action;
}

function report(result: InstallResult, output: vscode.OutputChannel, done: string, unchanged: string): void {
  if (!result.ok) {
    output.appendLine(`Claude Code hook: ${result.error}`);
    void vscode.window.showErrorMessage(`AgentLens: ${result.error}`);
    return;
  }
  void vscode.window.showInformationMessage(`AgentLens: ${result.changed ? done : unchanged}`);
}

export function registerHookCommands(extensionPath: string, output: vscode.OutputChannel): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand("agentlens.installClaudeHook", async () => {
      const settingsPath = settingsPathForWorkspace();
      if (settingsPath === undefined) {
        void vscode.window.showErrorMessage("AgentLens: open a folder before installing the Claude Code hook.");
        return;
      }
      const hookCommand = buildHookCommand(nodePath.join(extensionPath, "dist", "hook.js"));
      const accepted = await confirm(
        "Add the AgentLens hook to Claude Code in this workspace?",
        [
          `File: ${settingsPath}`,
          `Hook (PreToolUse, Edit|Write): ${hookCommand}`,
          "",
          "The hook only reports the file path, session id and tool name to this VS Code window. It never blocks Claude Code and never sends file contents. It needs node on your PATH.",
          "Existing settings are kept. Remove it later with AgentLens: Uninstall Claude Code Hook.",
        ].join("\n"),
        CONFIRM_INSTALL,
      );
      if (!accepted) {
        return;
      }
      report(await installHook(settingsPath, hookCommand), output, `hook installed in ${settingsPath}`, "hook is already installed.");
    }),
    vscode.commands.registerCommand("agentlens.uninstallClaudeHook", async () => {
      const settingsPath = settingsPathForWorkspace();
      if (settingsPath === undefined) {
        void vscode.window.showErrorMessage("AgentLens: open a folder first.");
        return;
      }
      const accepted = await confirm(
        "Remove the AgentLens hook from Claude Code in this workspace?",
        `File: ${settingsPath}\nOnly the AgentLens entry is removed.`,
        CONFIRM_UNINSTALL,
      );
      if (!accepted) {
        return;
      }
      report(await uninstallHook(settingsPath), output, "hook removed.", "no AgentLens hook was found.");
    }),
  ];
}
