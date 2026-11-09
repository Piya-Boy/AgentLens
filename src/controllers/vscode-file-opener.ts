import * as vscode from "vscode";
import { resolveWithinWorkspace } from "../utils/safe-path";
import { workspaceRoots } from "../workspace";

/** Opens in a preview tab. The editor keeps keyboard focus unless the user asked for the file. */
export async function openFileForObservation(filePath: string, takeFocus = false): Promise<void> {
  const realPath = await resolveWithinWorkspace(filePath, workspaceRoots());
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(realPath));
  await vscode.window.showTextDocument(document, { preview: true, preserveFocus: !takeFocus });
}
