import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  await runTests({
    extensionDevelopmentPath: root,
    extensionTestsPath: path.join(root, "out", "test", "suite.js"),
  });
} catch (error) {
  console.error("Integration tests failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
