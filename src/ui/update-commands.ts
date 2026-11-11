import * as vscode from "vscode";
import type { UpdateChecker, UpdateOutcome } from "../update/update-checker";

const OPEN_RELEASE = "Open release page";

/** Shows what a check found. A check nobody asked for stays quiet unless there is something to tell. */
export function presentUpdate(outcome: UpdateOutcome, requested: boolean): void {
  switch (outcome.kind) {
    case "update-available": {
      const { release, current } = outcome;
      void vscode.window
        .showInformationMessage(
          `AgentLens ${release.label} is available (installed: ${current}). VS Code updates installed extensions itself; this only tells you.`,
          OPEN_RELEASE,
        )
        .then((choice) => {
          if (choice === OPEN_RELEASE) {
            return vscode.env.openExternal(vscode.Uri.parse(release.url));
          }
          return undefined;
        });
      return;
    }
    case "up-to-date":
      if (requested) {
        void vscode.window.showInformationMessage(`AgentLens ${outcome.current} is up to date.`);
      }
      return;
    case "failed":
      if (requested) {
        void vscode.window.showWarningMessage(`AgentLens: could not check for updates (${outcome.reason}).`);
      }
      return;
    case "skipped":
      return;
  }
}

export function registerUpdateCommand(checker: UpdateChecker, log: (line: string) => void): vscode.Disposable {
  return vscode.commands.registerCommand("agentlens.checkForUpdates", async () => {
    const outcome = await checker.checkNow();
    log(`Update check (requested): ${outcome.kind === "failed" ? `failed, ${outcome.reason}` : outcome.kind}`);
    presentUpdate(outcome, true);
  });
}
