import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ENTRY_START = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/;

function findFiles(directory, matches) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...findFiles(full, matches));
    } else if (matches(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

function logEntries(text) {
  const entries = [];
  for (const line of text.split(/\r?\n/)) {
    if (ENTRY_START.test(line) || entries.length === 0) {
      entries.push(line);
    } else {
      entries[entries.length - 1] += `\n${line}`;
    }
  }
  return entries;
}

function normalized(text) {
  return text.replaceAll("\\", "/").toLowerCase();
}

/**
 * Reads the logs a finished Extension Development Host left in its user data folder and returns
 * the reasons a clean shutdown cannot be confirmed (empty when it can): the host must log that it
 * terminated, and no error logged during shutdown may have the extension bundle in its stack.
 *
 * The extension's own output channel cannot be used for this: its messages travel over the same
 * RPC channel that the host cancels while terminating, so a line written from deactivate() is lost.
 */
export function deactivationProblems(userDataDir, bundlePath) {
  const logsDir = path.join(userDataDir, "logs");
  let hostLogs;
  try {
    hostLogs = findFiles(logsDir, (name) => name === "exthost.log");
  } catch (error) {
    return [`cannot read ${logsDir}: ${error instanceof Error ? error.message : String(error)}`];
  }
  if (hostLogs.length === 0) {
    return ["no extension host log was written"];
  }

  const bundle = normalized(bundlePath);
  const problems = [];
  for (const file of hostLogs) {
    const entries = logEntries(readFileSync(file, "utf8"));
    if (!entries.some((entry) => entry.includes("Extension host terminating"))) {
      problems.push(`${file} does not show the host terminating`);
    }
    for (const entry of entries) {
      if (entry.includes("[error]") && normalized(entry).includes(bundle)) {
        problems.push(`${file} reports an error from the extension bundle: ${entry.split("\n")[0]}`);
      }
    }
  }
  return problems;
}
