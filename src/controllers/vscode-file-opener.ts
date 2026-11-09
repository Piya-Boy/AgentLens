import * as vscode from "vscode";
import { resolveWithinWorkspace } from "../utils/safe-path";
import { workspaceRoots } from "../workspace";

export async function openFileForObservation(filePath: string): Promise<void> {
  const realPath = await resolveWithinWorkspace(filePath, workspaceRoots());
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(realPath));
  await vscode.window.showTextDocument(document, { preview: true, preserveFocus: true });
}
