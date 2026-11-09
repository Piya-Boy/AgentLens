import * as assert from "node:assert/strict";
import * as vscode from "vscode";
import type { AgentLensApi } from "../../extension";

const EXTENSION_NAME = "agentlens";

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
