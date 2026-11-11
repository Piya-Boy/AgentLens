import * as vscode from "vscode";
import { resolveWithinWorkspace } from "../utils/safe-path";
import { workspaceRoots } from "../workspace";

/** Real path of an existing file inside the workspace; rejects when it is missing or escapes. */
export function resolveObservableFile(filePath: string): Promise<string> {
  return resolveWithinWorkspace(filePath, workspaceRoots());
}

/** Opens in a preview tab. The editor keeps keyboard focus unless the user asked for the file. */
export async function showObservedFile(realPath: string, takeFocus = false): Promise<void> {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(realPath));
  await vscode.window.showTextDocument(document, { preview: true, preserveFocus: !takeFocus });
}

export async function openFileForObservation(filePath: string, takeFocus = false): Promise<void> {
  await showObservedFile(await resolveObservableFile(filePath), takeFocus);
}
