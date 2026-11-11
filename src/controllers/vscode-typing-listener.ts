import * as vscode from "vscode";
import type { TypingTracker } from "./typing-tracker";

/**
 * Counts an event as typing when it concerns the active editor's document and the document is
 * unsaved. VS Code reports the first edit twice: the content change while the document is still
 * clean, then an event without content changes once it turns dirty, so the dirty flag alone is
 * the signal. Agent writes reach clean documents through a disk reload and never match.
 */
export function watchTyping(tracker: TypingTracker): vscode.Disposable {
  return vscode.workspace.onDidChangeTextDocument((change) => {
    if (change.document.isDirty && change.document === vscode.window.activeTextEditor?.document) {
      tracker.recordTyping();
    }
  });
}
