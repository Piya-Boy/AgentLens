import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import { readConfig } from "./config";
import { FocusController } from "./controllers/focus-controller";
import { openFileForObservation } from "./controllers/vscode-file-opener";
import { ActivityFilterState, type ActivityFilter } from "./core/activity-filter";
import { ActivityStore } from "./core/activity-store";
import { EnabledState } from "./core/enabled-state";
import { FilesystemDetector } from "./detectors/filesystem-detector";
import { PauseState } from "./core/pause-state";
import { EventManager, type IngestResult } from "./core/event-manager";
import { createMockEvent } from "./core/mock-event";
import { parseClaudePreToolUse } from "./adapters/claude/pre-tool-use";
import type { AgentFileEvent } from "./models/agent-file-event";
import { SessionManager, type SessionInfo } from "./core/session-manager";
import { HookListener } from "./transport/hook-listener";
import { registerUi } from "./ui/register-ui";
import { workspaceRoots } from "./workspace";

export type IngestOutcome = IngestResult | { readonly accepted: false; readonly reason: "disabled" };

export interface AgentLensApi {
  isEnabled(): boolean;
  isPaused(): boolean;
  sessions(): readonly SessionInfo[];
  history(): readonly AgentFileEvent[];
  activityFilter(): ActivityFilter;
  hookEndpoints(): readonly string[];
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function activate(context: vscode.ExtensionContext): AgentLensApi {
  const output = vscode.window.createOutputChannel("AgentLens");
  const enabledState = new EnabledState(context.workspaceState);
  const pauseState = new PauseState();
  const sessionManager = new SessionManager();
  const activityStore = new ActivityStore();
  const filterState = new ActivityFilterState();
  const eventManager = new EventManager({
    getWorkspaceRoots: workspaceRoots,
    reportListenerError: (error) => {
      output.appendLine(`Event listener failed: ${describeError(error)}`);
    },
  });

  const focusController = new FocusController({
    openFile: openFileForObservation,
    isPaused: () => pauseState.isPaused,
    isAutoFocusEnabled: () => readConfig().autoFocus,
    getCooldownMs: () => readConfig().focusCooldownMs,
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

  const filesystemDetector = new FilesystemDetector({
    emit: (event) => {
      ingest(event);
    },
    getIgnoredFolders: () => readConfig().ignoredFolders,
    reportError: (error) => {
      output.appendLine(`Filesystem detector failed: ${describeError(error)}`);
    },
  });

  const hookListener = new HookListener({
    onMessage: (message) => {
      const parsed = parseClaudePreToolUse(message, Date.now());
      if (!parsed.ok) {
        output.appendLine(`Ignored hook message (${parsed.reason}): ${parsed.detail}`);
        return;
      }
      ingest(parsed.event);
    },
    reportError: (error) => {
      output.appendLine(`Hook listener: ${describeError(error)}`);
    },
  });

  const setEnabled = async (enabled: boolean): Promise<void> => {
    await enabledState.setEnabled(enabled);
    void vscode.window.showInformationMessage(`AgentLens ${enabled ? "enabled" : "disabled"}.`);
  };

  const setPaused = (paused: boolean): void => {
    if (paused) {
      pauseState.pause();
    } else {
      pauseState.resume();
    }
    void vscode.window.showInformationMessage(`AgentLens focus ${paused ? "paused" : "resumed"}.`);
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
    focusController,
    filesystemDetector,
    hookListener,
    ...registerUi({ activityStore, filterState, sessionManager, enabledState, pauseState }),
    vscode.commands.registerCommand("agentlens.enable", () => setEnabled(true)),
    vscode.commands.registerCommand("agentlens.disable", () => setEnabled(false)),
    vscode.commands.registerCommand("agentlens.pause", () => {
      setPaused(true);
    }),
    vscode.commands.registerCommand("agentlens.resume", () => {
      setPaused(false);
    }),
    vscode.commands.registerCommand("agentlens.clearHistory", () => {
      activityStore.clear();
      sessionManager.clear();
      output.appendLine("History cleared");
    }),
    vscode.commands.registerCommand("agentlens.sendMockEvent", sendMockEvent),
    pauseState.onDidChange((paused) => {
      output.appendLine(`Focus ${paused ? "paused" : "resumed"}`);
    }),
    enabledState.onDidChange((enabled) => {
      output.appendLine(`State changed: ${enabled ? "enabled" : "disabled"}`);
    }),
    eventManager.onEvent((event) => {
      sessionManager.record(event);
      activityStore.add(event);
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
    isPaused: () => pauseState.isPaused,
    sessions: () => sessionManager.list(),
    history: () => activityStore.list(),
    activityFilter: () => filterState.filter,
    hookEndpoints: () => hookListener.endpoints(),
  };
}

export function deactivate(): void {
  // Disposables registered on context.subscriptions are released by VS Code.
}
