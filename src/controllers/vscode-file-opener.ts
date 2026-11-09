import * as vscode from "vscode";

export async function openFileForObservation(filePath: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
  await vscode.window.showTextDocument(document, { preview: true, preserveFocus: true });
}
