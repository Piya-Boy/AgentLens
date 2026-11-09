import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import { readConfig } from "./config";
import { FocusController } from "./controllers/focus-controller";
import { TabController } from "./controllers/tab-controller";
import { TypingTracker } from "./controllers/typing-tracker";
import { offerFileForObservation } from "./controllers/vscode-file-notifier";
import {
  closeVscodeTabs,
  createManagedOpener,
  listVscodeTabs,
  realPathKeys,
  type VscodeTab,
} from "./controllers/vscode-tabs";
import { watchTyping } from "./controllers/vscode-typing-listener";
import { ActivityFilterState, type ActivityFilter } from "./core/activity-filter";
import { ActivityStore } from "./core/activity-store";
import { EnabledState } from "./core/enabled-state";
import { FilesystemDetector } from "./detectors/filesystem-detector";
import { PauseState } from "./core/pause-state";
import { EventManager, type IngestResult } from "./core/event-manager";
import { safeLogText } from "./core/log-text";
import { createMockEvent } from "./core/mock-event";
import { runAdapter } from "./adapters/adapter";
import { claudeCodeAdapter } from "./adapters/claude/pre-tool-use";
import type { AgentFileEvent } from "./models/agent-file-event";
import { SessionManager, type SessionInfo } from "./core/session-manager";
import { HookListener } from "./transport/hook-listener";
import { registerHookCommands } from "./ui/hook-commands";
import { registerUi } from "./ui/register-ui";
import { presentUpdate, registerUpdateCommand } from "./ui/update-commands";
import { fetchJson } from "./update/github-fetch";
import { LATEST_RELEASE_API } from "./update/release";
import { UpdateChecker } from "./update/update-checker";
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

const UPDATE_CHECK_DELAY_MS = 10_000;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function activate(context: vscode.ExtensionContext): AgentLensApi {
  const output = vscode.window.createOutputChannel("AgentLens");
  const log = (line: string): void => {
    output.appendLine(safeLogText(line));
  };
  const enabledState = new EnabledState(context.workspaceState);
  const pauseState = new PauseState();
  const sessionManager = new SessionManager();
  const activityStore = new ActivityStore();
  const filterState = new ActivityFilterState();
  const eventManager = new EventManager({
    getWorkspaceRoots: workspaceRoots,
    reportListenerError: (error) => {
      log(`Event listener failed: ${describeError(error)}`);
    },
  });

  const typingTracker = new TypingTracker();
  const reportFocusError = (error: unknown): void => {
    log(`Focus failed: ${describeError(error)}`);
  };
  const tabController = new TabController<VscodeTab>({
    listTabs: listVscodeTabs,
    closeTabs: closeVscodeTabs,
    getProtectedKeys: () => realPathKeys(sessionManager.list().map((session) => session.lastFilePath)),
    getMaxTabs: () => readConfig().maxTabs,
    reportError: reportFocusError,
  });
  const focusController = new FocusController({
    openFile: createManagedOpener(tabController),
    notifyFile: (event) => {
      offerFileForObservation(event, reportFocusError);
    },
    isPaused: () => pauseState.isPaused,
    isUserBusy: () => typingTracker.isBusy(),
    getMode: () => readConfig().focusMode,
    getCooldownMs: () => readConfig().focusCooldownMs,
    reportError: reportFocusError,
  });

  const ingest = (input: unknown): IngestOutcome => {
    if (!enabledState.isEnabled) {
      return { accepted: false, reason: "disabled" };
    }
    const result = eventManager.ingest(input);
    if (!result.accepted) {
      const details = result.reason === "invalid" ? `: ${result.errors.join("; ")}` : "";
      log(`Rejected event (${result.reason})${details}`);
    }
    return result;
  };

  const filesystemDetector = new FilesystemDetector({
    emit: (event) => {
      ingest(event);
    },
    getIgnoredFolders: () => readConfig().ignoredFolders,
    reportError: (error) => {
      log(`Filesystem detector failed: ${describeError(error)}`);
    },
  });

  const hookListener = new HookListener({
    onMessage: (message) => {
      const parsed = runAdapter(claudeCodeAdapter, message, Date.now());
      if (!parsed.ok) {
        log(`Ignored hook message (${parsed.reason}): ${parsed.detail}`);
        return;
      }
      ingest(parsed.event);
    },
    reportError: (error) => {
      log(`Hook listener: ${describeError(error)}`);
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

  const installedVersion = String((context.extension.packageJSON as { version?: unknown }).version);
  const updateChecker = new UpdateChecker({
    currentVersion: installedVersion,
    fetchLatest: () => fetchJson(LATEST_RELEASE_API, `AgentLens/${installedVersion}`),
    state: context.globalState,
    now: Date.now,
    reportError: (error) => {
      log(`Update check could not save its state: ${describeError(error)}`);
    },
  });
  const startupUpdateCheck = setTimeout(() => {
    if (!readConfig().checkForUpdates) {
      return;
    }
    updateChecker
      .checkIfDue()
      .then((outcome) => {
        log(`Update check (automatic): ${outcome.kind === "failed" ? `failed, ${outcome.reason}` : outcome.kind}`);
        presentUpdate(outcome, false);
      })
      .catch((error: unknown) => {
        log(`Update check failed: ${describeError(error)}`);
      });
  }, UPDATE_CHECK_DELAY_MS);

  context.subscriptions.push(
    output,
    { dispose: () => clearTimeout(startupUpdateCheck) },
    registerUpdateCommand(updateChecker, log),
    focusController,
    watchTyping(typingTracker),
    filesystemDetector,
    hookListener,
    ...registerHookCommands(context.extensionPath, { appendLine: log }),
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
      log("History cleared");
    }),
    vscode.commands.registerCommand("agentlens.sendMockEvent", sendMockEvent),
    pauseState.onDidChange((paused) => {
      log(`Focus ${paused ? "paused" : "resumed"}`);
    }),
    enabledState.onDidChange((enabled) => {
      log(`State changed: ${enabled ? "enabled" : "disabled"}`);
    }),
    eventManager.onEvent((event) => {
      sessionManager.record(event);
      activityStore.add(event);
      log(`Event ${event.status} ${event.action} ${event.filePath} (${event.agentId}/${event.sessionId})`);
      void focusController.handle(event);
    }),
  );

  const config = readConfig();
  log(
    `Activated (${enabledState.isEnabled ? "enabled" : "disabled"}, focusMode=${config.focusMode}, maxTabs=${String(config.maxTabs)})`,
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
