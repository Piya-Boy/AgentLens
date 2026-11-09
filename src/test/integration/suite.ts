import * as assert from "node:assert/strict";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import type { AgentLensApi, IngestOutcome } from "../../extension";

const EXTENSION_NAME = "agentlens";

function fixtureFile(): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, "fixture workspace is not open");
  return path.join(folder.uri.fsPath, "sample.txt");
}

async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function isFixtureVisible(): boolean {
  const expected = path.normalize(fixtureFile());
  return vscode.window.visibleTextEditors.some((editor) => path.normalize(editor.document.uri.fsPath) === expected);
}

async function sendMockEvent(filePath: string): Promise<IngestOutcome | undefined> {
  return vscode.commands.executeCommand<IngestOutcome | undefined>("agentlens.sendMockEvent", filePath);
}

interface TestCase {
  readonly name: string;
  readonly run: (api: AgentLensApi) => Promise<void>;
}

const cases: readonly TestCase[] = [
  {
    name: "registers enable and disable commands",
    run: async () => {
      const commands = await vscode.commands.getCommands(true);
      assert.ok(commands.includes("agentlens.enable"));
      assert.ok(commands.includes("agentlens.disable"));
    },
  },
  {
    name: "is enabled after activation",
    run: (api) => {
      assert.equal(api.isEnabled(), true);
      return Promise.resolve();
    },
  },
  {
    name: "disable command turns the extension off and enable turns it back on",
    run: async (api) => {
      await vscode.commands.executeCommand("agentlens.disable");
      assert.equal(api.isEnabled(), false);
      await vscode.commands.executeCommand("agentlens.enable");
      assert.equal(api.isEnabled(), true);
    },
  },
  {
    name: "records a session and opens the file for a mock event inside the workspace",
    run: async (api) => {
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      assert.equal(isFixtureVisible(), false);
      const before = api.sessions().length;
      const result = await sendMockEvent(fixtureFile());
      assert.equal(result?.accepted, true);
      await waitFor(isFixtureVisible);
      const sessions = api.sessions();
      assert.equal(sessions.length, before + 1);
      const session = sessions.find((candidate) => candidate.agentId === "mock");
      assert.ok(session);
      assert.equal(session.eventCount, 1);
      assert.equal(session.lastFilePath, path.normalize(fixtureFile()));
    },
  },
  {
    name: "rejects a mock event outside the workspace",
    run: async (api) => {
      const before = api.sessions().length;
      const result = await sendMockEvent(path.join(os.tmpdir(), "agentlens-outside.txt"));
      assert.equal(result?.accepted, false);
      assert.equal(result.reason, "invalid");
      assert.equal(api.sessions().length, before);
    },
  },
  {
    name: "ignores mock events while disabled",
    run: async (api) => {
      await vscode.commands.executeCommand("agentlens.disable");
      try {
        const result = await sendMockEvent(fixtureFile());
        assert.deepEqual(result, { accepted: false, reason: "disabled" });
      } finally {
        await vscode.commands.executeCommand("agentlens.enable");
      }
      assert.equal(api.isEnabled(), true);
    },
  },
  {
    name: "exposes default configuration",
    run: () => {
      const section = vscode.workspace.getConfiguration("agentlens");
      assert.equal(section.get("autoFocus"), true);
      assert.equal(section.get("maxTabs"), 5);
      return Promise.resolve();
    },
  },
];

export async function run(): Promise<void> {
  const extension = vscode.extensions.all.find(
    (candidate) => (candidate.packageJSON as { name?: string }).name === EXTENSION_NAME,
  );
  assert.ok(extension, `extension "${EXTENSION_NAME}" not found in the Extension Development Host`);

  const api = (await extension.activate()) as AgentLensApi;
  assert.equal(extension.isActive, true);

  const failures: string[] = [];
  for (const testCase of cases) {
    try {
      await testCase.run(api);
      console.log(`  PASS ${testCase.name}`);
    } catch (error) {
      failures.push(testCase.name);
      console.error(`  FAIL ${testCase.name}\n${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`${failures.length} integration test(s) failed: ${failures.join(", ")}`);
  }
}
