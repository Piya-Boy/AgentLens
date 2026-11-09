import * as vscode from "vscode";
import { describeOffer } from "../core/activity-format";
import type { AgentFileEvent } from "../models/agent-file-event";
import { openFileForObservation } from "./vscode-file-opener";

const OPEN_ACTION = "Open";

/** Offers the file without opening it. Opening happens only when the user clicks Open. */
export function offerFileForObservation(event: AgentFileEvent, reportError: (error: unknown) => void): void {
  void vscode.window.showInformationMessage(describeOffer(event), OPEN_ACTION).then(
    (choice) => {
      if (choice === OPEN_ACTION) {
        openFileForObservation(event.filePath, true).catch(reportError);
      }
    },
    reportError,
  );
}
