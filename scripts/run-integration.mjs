import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";
import { deactivationProblems } from "./verify-deactivation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureWorkspace = path.join(root, "src", "test", "fixtures", "workspace");
const requestedVersion = process.env.VSCODE_TEST_VERSION;
const packagedPath = process.env.AGENTLENS_EXTENSION_PATH;
const extensionPath = packagedPath === undefined ? root : path.resolve(packagedPath);
const suffix = `${requestedVersion === undefined ? "" : `-${requestedVersion}`}${packagedPath === undefined ? "" : "-packaged"}`;
const userDataDir = path.join(root, ".vscode-test", `user-data-integration${suffix}`);

try {
  rmSync(path.join(userDataDir, "logs"), { recursive: true, force: true });
  await runTests({
    ...(requestedVersion === undefined ? {} : { version: requestedVersion }),
    extensionDevelopmentPath: extensionPath,
    extensionTestsPath: path.join(root, "out", "test", "suite.js"),
    launchArgs: [fixtureWorkspace, "--disable-extensions", `--user-data-dir=${userDataDir}`],
  });
} catch (error) {
  console.error("Integration tests failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}

const problems = deactivationProblems(userDataDir, path.join(extensionPath, "dist", "extension.js"));
if (problems.length > 0) {
  console.error(`Shutdown check failed:\n${problems.map((problem) => `- ${problem}`).join("\n")}`);
  process.exit(1);
}
console.log("Shutdown check passed: the host terminated and logged no error from the extension bundle.");
