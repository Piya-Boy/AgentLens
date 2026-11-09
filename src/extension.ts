import * as vscode from "vscode";
import { readConfig } from "./config";
import { EnabledState } from "./core/enabled-state";

export interface AgentLensApi {
  isEnabled(): boolean;
}

export function activate(context: vscode.ExtensionContext): AgentLensApi {
  const output = vscode.window.createOutputChannel("AgentLens");
  const enabledState = new EnabledState(context.workspaceState);

  const setEnabled = async (enabled: boolean): Promise<void> => {
    await enabledState.setEnabled(enabled);
    void vscode.window.showInformationMessage(`AgentLens ${enabled ? "enabled" : "disabled"}.`);
  };

  context.subscriptions.push(
    output,
    vscode.commands.registerCommand("agentlens.enable", () => setEnabled(true)),
    vscode.commands.registerCommand("agentlens.disable", () => setEnabled(false)),
    enabledState.onDidChange((enabled) => {
      output.appendLine(`State changed: ${enabled ? "enabled" : "disabled"}`);
    }),
  );

  const config = readConfig();
  output.appendLine(
    `Activated (${enabledState.isEnabled ? "enabled" : "disabled"}, autoFocus=${String(config.autoFocus)}, maxTabs=${String(config.maxTabs)})`,
  );

  return { isEnabled: () => enabledState.isEnabled };
}

export function deactivate(): void {
  // Disposables registered on context.subscriptions are released by VS Code.
}
