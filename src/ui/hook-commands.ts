import nodePath from "node:path";
import * as vscode from "vscode";
import { installHook, uninstallHook, type InstallResult } from "../adapters/claude/hook-installer";
import { buildHookCommand, isShellSafePath } from "../adapters/claude/hook-settings";

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

function report(result: InstallResult, output: Pick<vscode.OutputChannel, "appendLine">, done: string, unchanged: string): void {
  if (!result.ok) {
    output.appendLine(`Claude Code hook: ${result.error}`);
    void vscode.window.showErrorMessage(`AgentLens: ${result.error}`);
    return;
  }
  void vscode.window.showInformationMessage(`AgentLens: ${result.changed ? done : unchanged}`);
}

export type InstallFlowResult = "installed" | "unchanged" | "cancelled" | "failed";

/**
 * Deploys the hook script and writes the settings entry. `confirmFirst` shows the modal that spells out the file
 * and the command; the offer on start-up passes false because pressing its Install button is the confirmation.
 */
export async function installHookInWorkspace(
  deployHook: () => string,
  output: Pick<vscode.OutputChannel, "appendLine">,
  confirmFirst: boolean,
): Promise<InstallFlowResult> {
  const settingsPath = settingsPathForWorkspace();
  if (settingsPath === undefined) {
    void vscode.window.showErrorMessage("AgentLens: open a folder before installing the Claude Code hook.");
    return "failed";
  }
  let hookScriptPath: string;
  try {
    hookScriptPath = deployHook();
  } catch (error) {
    const message = `the hook script could not be prepared (${error instanceof Error ? error.message : String(error)}); the hook was not installed`;
    output.appendLine(`Claude Code hook: ${message}`);
    void vscode.window.showErrorMessage(`AgentLens: ${message}`);
    return "failed";
  }
  if (!isShellSafePath(hookScriptPath)) {
    const message = `the hook script path contains a character a shell would expand (${hookScriptPath}); the hook was not installed`;
    output.appendLine(`Claude Code hook: ${message}`);
    void vscode.window.showErrorMessage(`AgentLens: ${message}`);
    return "failed";
  }
  const hookCommand = buildHookCommand(hookScriptPath);
  if (confirmFirst) {
    const accepted = await confirm(
      "Add the AgentLens hook to Claude Code in this workspace?",
      [
        `File: ${settingsPath}`,
        `Hook (PreToolUse, Edit|Write): ${hookCommand}`,
        "",
        "The hook only reports the file path, session id and tool name to this VS Code window. It never blocks Claude Code and never sends file contents. It needs node on your PATH.",
        "The script is a copy that AgentLens keeps up to date, so this entry stays valid when the extension updates.",
        "Existing settings are kept. Remove it later with AgentLens: Uninstall Claude Code Hook.",
      ].join("\n"),
      CONFIRM_INSTALL,
    );
    if (!accepted) {
      return "cancelled";
    }
  }
  const result = await installHook(settingsPath, hookCommand);
  report(result, output, `hook installed in ${settingsPath}. Start Claude Code in this folder; if a session was already open and files do not open, restart it.`, "hook is already installed.");
  if (!result.ok) {
    return "failed";
  }
  return result.changed ? "installed" : "unchanged";
}

/** `deployHook` puts the current hook script at its stable path and returns that path, or throws. */
export function registerHookCommands(deployHook: () => string, output: Pick<vscode.OutputChannel, "appendLine">): vscode.Disposable[] {
  return [
    vscode.commands.registerCommand("agentlens.installClaudeHook", async () => {
      await installHookInWorkspace(deployHook, output, true);
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
