import * as assert from "node:assert/strict";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { ActivityFilterState } from "../../core/activity-filter";
import { ActivityStore } from "../../core/activity-store";
import { SessionManager } from "../../core/session-manager";
import type { AgentLensApi, IngestOutcome } from "../../extension";
import { ActivityTreeProvider } from "../../providers/activity-tree";
import { SessionsTreeProvider } from "../../providers/sessions-tree";

const EXTENSION_NAME = "agentlens";
let extensionRoot = "";

function runHookScript(stdin: string, cwd: string): Promise<{ code: number | null; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [path.join(extensionRoot, "dist", "hook.js")], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout });
    });
    child.stdin.end(stdin);
  });
}

function fixtureFile(name = "sample.txt"): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, "fixture workspace is not open");
  return path.join(folder.uri.fsPath, name);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error("timed out waiting for condition");
    }
    await delay(50);
  }
}

function isFixtureVisible(name = "sample.txt"): boolean {
  const expected = path.normalize(fixtureFile(name));
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
      assert.ok(commands.includes("agentlens.installClaudeHook"));
      assert.ok(commands.includes("agentlens.uninstallClaudeHook"));
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
    name: "does not open files while paused and opens them again after resume",
    run: async (api) => {
      const target = fixtureFile("other.txt");
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      await vscode.commands.executeCommand("agentlens.pause");
      try {
        assert.equal(api.isPaused(), true);
        const before = api.sessions().find((candidate) => candidate.agentId === "mock")?.eventCount ?? 0;
        const paused = await sendMockEvent(target);
        assert.equal(paused?.accepted, true);
        assert.equal(api.sessions().find((candidate) => candidate.agentId === "mock")?.eventCount, before + 1);
        await delay(600);
        assert.equal(isFixtureVisible("other.txt"), false);
      } finally {
        await vscode.commands.executeCommand("agentlens.resume");
      }
      assert.equal(api.isPaused(), false);

      const resumed = await sendMockEvent(target);
      assert.equal(resumed?.accepted, true);
      await waitFor(() => isFixtureVisible("other.txt"));
    },
  },
  {
    name: "records events but does not open files when the focus mode is notify or off",
    run: async (api) => {
      const target = fixtureFile("third.txt");
      const section = vscode.workspace.getConfiguration("agentlens");
      const mockCount = (): number => api.sessions().find((candidate) => candidate.agentId === "mock")?.eventCount ?? 0;
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      try {
        for (const mode of ["notify", "off"]) {
          await section.update("focusMode", mode, vscode.ConfigurationTarget.Global);
          const before = mockCount();
          const outcome = await sendMockEvent(target);
          assert.equal(outcome?.accepted, true, `event rejected in ${mode} mode`);
          assert.equal(mockCount(), before + 1);
          await delay(600);
          assert.equal(isFixtureVisible("third.txt"), false, `file opened in ${mode} mode`);
        }
      } finally {
        await section.update("focusMode", undefined, vscode.ConfigurationTarget.Global);
      }

      await delay(600);
      const outcome = await sendMockEvent(target);
      assert.equal(outcome?.accepted, true);
      await waitFor(() => isFixtureVisible("third.txt"));
    },
  },
  {
    name: "observes file changes made outside the extension as filesystem events without opening them",
    run: async (api) => {
      const target = fixtureFile("external-change.txt");
      const expectedPath = path.normalize(target).toLowerCase();
      const unknownSession = () => api.sessions().find((candidate) => candidate.agentId === "unknown");
      const observed = (action: string, countAbove: number): boolean => {
        const session = unknownSession();
        return (
          session !== undefined &&
          session.lastStatus === "observed" &&
          session.lastAction === action &&
          session.lastFilePath.toLowerCase() === expectedPath &&
          session.eventCount > countAbove
        );
      };
      const count = (): number => unknownSession()?.eventCount ?? 0;

      try {
        await fs.writeFile(target, "created by a separate writer\n");
        await waitFor(() => (unknownSession()?.lastFilePath.toLowerCase() ?? "") === expectedPath);
        assert.equal(isFixtureVisible("external-change.txt"), false);

        await delay(800);
        let before = count();
        await fs.appendFile(target, "appended\n");
        await waitFor(() => observed("edit", before));

        await delay(800);
        before = count();
        await fs.rm(target);
        await waitFor(() => observed("delete", before));
      } finally {
        await fs.rm(target, { force: true });
      }
    },
  },
  {
    name: "keeps event history and clears it with the clear history command",
    run: async (api) => {
      await delay(600);
      const sent = await sendMockEvent(fixtureFile());
      assert.equal(sent?.accepted, true);
      const newest = api.history()[0];
      assert.ok(newest);
      assert.equal(newest.status === "started" || newest.status === "observed", true);
      assert.ok(api.history().length > 0);

      await vscode.commands.executeCommand("agentlens.clearHistory");
      assert.equal(api.history().length, 0);
      assert.equal(api.sessions().length, 0);
    },
  },
  {
    name: "registers the AgentLens activity bar view container",
    run: async () => {
      const commands = await vscode.commands.getCommands(true);
      assert.ok(commands.includes("workbench.view.extension.agentlens"));
      await vscode.commands.executeCommand("workbench.view.extension.agentlens");
    },
  },
  {
    name: "renders activity and session tree items distinguishing observed from pre-edit",
    run: () => {
      const store = new ActivityStore();
      const sessions = new SessionManager();
      const preEdit = {
        eventId: "e1",
        agentId: "claude-code",
        sessionId: "s1",
        action: "edit",
        status: "started",
        filePath: fixtureFile(),
        timestamp: 1000,
        source: "adapter",
      } as const;
      const observed = { ...preEdit, eventId: "e2", agentId: "unknown", sessionId: "filesystem", status: "observed", source: "filesystem" } as const;
      for (const event of [preEdit, observed]) {
        store.add(event);
        sessions.record(event);
      }

      const activity = new ActivityTreeProvider(store, new ActivityFilterState(), () => "time");
      const sessionsView = new SessionsTreeProvider(sessions, () => "time");
      try {
        const labels = activity.getChildren().map((event) => {
          const label = activity.getTreeItem(event).label;
          return typeof label === "string" ? label : label?.label;
        });
        assert.deepEqual(labels, ["observed edit sample.txt", "started edit sample.txt"]);
        assert.equal(sessionsView.getChildren().length, 2);
        const firstSession = sessionsView.getChildren()[0];
        assert.ok(firstSession);
        assert.equal(sessionsView.getTreeItem(firstSession).description, "1 event · time");
      } finally {
        activity.dispose();
        sessionsView.dispose();
      }
      return Promise.resolve();
    },
  },
  {
    name: "filters activity through the filter command and clears the filter",
    run: async (api) => {
      await vscode.commands.executeCommand("agentlens.filterActivity", { agentId: "mock", action: "edit" });
      assert.deepEqual(api.activityFilter(), { agentId: "mock", action: "edit" });

      await vscode.commands.executeCommand("agentlens.filterActivity", { action: "write" });
      assert.deepEqual(api.activityFilter(), { agentId: "mock", action: "edit" });

      await vscode.commands.executeCommand("agentlens.clearActivityFilter");
      assert.deepEqual(api.activityFilter(), {});
    },
  },
  {
    name: "applies the filter to the activity tree",
    run: () => {
      const store = new ActivityStore();
      const filterState = new ActivityFilterState();
      const base = {
        eventId: "e1",
        agentId: "claude-code",
        sessionId: "s1",
        action: "edit",
        status: "started",
        filePath: fixtureFile(),
        timestamp: 1000,
        source: "adapter",
      } as const;
      store.add(base);
      store.add({ ...base, eventId: "e2", agentId: "unknown", sessionId: "filesystem" });

      const provider = new ActivityTreeProvider(store, filterState, () => "time");
      try {
        assert.equal(provider.getChildren().length, 2);
        filterState.set({ agentId: "unknown" });
        assert.deepEqual(
          provider.getChildren().map((event) => event.eventId),
          ["e2"],
        );
        filterState.clear();
        assert.equal(provider.getChildren().length, 2);
      } finally {
        provider.dispose();
      }
      return Promise.resolve();
    },
  },
  {
    name: "delivers a real Claude Code PreToolUse payload through the hook script and opens the file",
    run: async (api) => {
      await waitFor(() => api.hookEndpoints().length > 0);
      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      assert.equal(isFixtureVisible("third.txt"), false);

      const workspaceRoot = path.dirname(fixtureFile());
      const payload = JSON.stringify({
        session_id: "e2e-session",
        transcript_path: "/tmp/transcript.jsonl",
        cwd: workspaceRoot,
        permission_mode: "default",
        hook_event_name: "PreToolUse",
        tool_name: "Write",
        tool_input: { file_path: fixtureFile("third.txt"), content: "TOP SECRET SOURCE CONTENT" },
        tool_use_id: "toolu_e2e_1",
      });

      const result = await runHookScript(payload, workspaceRoot);
      assert.equal(result.code, 0);
      assert.equal(result.stdout, "");

      await waitFor(() => api.sessions().some((session) => session.agentId === "claude-code" && session.sessionId === "e2e-session"));
      await waitFor(() => isFixtureVisible("third.txt"));
      assert.equal(JSON.stringify(api.history()).includes("TOP SECRET"), false);
    },
  },
  {
    name: "hook script exits 0 without output when no AgentLens instance is listening",
    run: async () => {
      const result = await runHookScript(
        JSON.stringify({
          session_id: "s",
          cwd: os.tmpdir(),
          hook_event_name: "PreToolUse",
          tool_name: "Edit",
          tool_use_id: "t",
          tool_input: { file_path: path.join(os.tmpdir(), "x.txt") },
        }),
        os.tmpdir(),
      );
      assert.equal(result.code, 0);
      assert.equal(result.stdout, "");
    },
  },
  {
    name: "exposes default configuration",
    run: () => {
      const section = vscode.workspace.getConfiguration("agentlens");
      assert.equal(section.get("focusMode"), "auto");
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

  extensionRoot = extension.extensionPath;
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
