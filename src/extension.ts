import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import { readConfig } from "./config";
import { FocusController } from "./controllers/focus-controller";
import { openFileForObservation } from "./controllers/vscode-file-opener";
import { EnabledState } from "./core/enabled-state";
import { EventManager, type IngestResult } from "./core/event-manager";
import { createMockEvent } from "./core/mock-event";
import { SessionManager, type SessionInfo } from "./core/session-manager";

export type IngestOutcome = IngestResult | { readonly accepted: false; readonly reason: "disabled" };

export interface AgentLensApi {
  isEnabled(): boolean;
  sessions(): readonly SessionInfo[];
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function workspaceRoots(): readonly string[] {
  return (vscode.workspace.workspaceFolders ?? [])
    .filter((folder) => folder.uri.scheme === "file")
    .map((folder) => folder.uri.fsPath);
}

export function activate(context: vscode.ExtensionContext): AgentLensApi {
  const output = vscode.window.createOutputChannel("AgentLens");
  const enabledState = new EnabledState(context.workspaceState);
  const sessionManager = new SessionManager();
  const eventManager = new EventManager({
    getWorkspaceRoots: workspaceRoots,
    reportListenerError: (error) => {
      output.appendLine(`Event listener failed: ${describeError(error)}`);
    },
  });

  const focusController = new FocusController({
    openFile: openFileForObservation,
    isAutoFocusEnabled: () => readConfig().autoFocus,
    reportError: (error) => {
      output.appendLine(`Focus failed: ${describeError(error)}`);
    },
  });

  const ingest = (input: unknown): IngestOutcome => {
    if (!enabledState.isEnabled) {
      return { accepted: false, reason: "disabled" };
    }
    const result = eventManager.ingest(input);
    if (!result.accepted) {
      const details = result.reason === "invalid" ? `: ${result.errors.join("; ")}` : "";
      output.appendLine(`Rejected event (${result.reason})${details}`);
    }
    return result;
  };

  const setEnabled = async (enabled: boolean): Promise<void> => {
    await enabledState.setEnabled(enabled);
    void vscode.window.showInformationMessage(`AgentLens ${enabled ? "enabled" : "disabled"}.`);
  };

  const sendMockEvent = (filePath?: unknown): IngestOutcome | undefined => {
    const target = typeof filePath === "string" ? filePath : vscode.window.activeTextEditor?.document.uri.fsPath;
    if (target === undefined) {
      void vscode.window.showWarningMessage("AgentLens: open a file to send a mock event.");
      return undefined;
    }
    return ingest(createMockEvent(target, Date.now(), randomUUID()));
  };

  context.subscriptions.push(
    output,
    vscode.commands.registerCommand("agentlens.enable", () => setEnabled(true)),
    vscode.commands.registerCommand("agentlens.disable", () => setEnabled(false)),
    vscode.commands.registerCommand("agentlens.sendMockEvent", sendMockEvent),
    enabledState.onDidChange((enabled) => {
      output.appendLine(`State changed: ${enabled ? "enabled" : "disabled"}`);
    }),
    eventManager.onEvent((event) => {
      sessionManager.record(event);
      output.appendLine(`Event ${event.status} ${event.action} ${event.filePath} (${event.agentId}/${event.sessionId})`);
      void focusController.handle(event);
    }),
  );

  const config = readConfig();
  output.appendLine(
    `Activated (${enabledState.isEnabled ? "enabled" : "disabled"}, autoFocus=${String(config.autoFocus)}, maxTabs=${String(config.maxTabs)})`,
  );

  return {
    isEnabled: () => enabledState.isEnabled,
    sessions: () => sessionManager.list(),
  };
}

export function deactivate(): void {
  // Disposables registered on context.subscriptions are released by VS Code.
}
