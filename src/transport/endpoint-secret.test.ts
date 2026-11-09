import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { endpointForRoot, type EndpointEnvironment } from "./endpoint";
import { loadOrCreateSecret, readSecret, secretFilePath } from "./endpoint-secret";

let base: string;
let counter = 0;

beforeAll(async () => {
  base = await mkdtemp(path.join(tmpdir(), "agentlens-secret-"));
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

function newSecretFile(): string {
  counter += 1;
  return path.join(base, `home-${String(counter)}`, "agentlens", "endpoint-secret");
}

describe("secretFilePath", () => {
  it("uses LOCALAPPDATA on windows", () => {
    expect(secretFilePath({ platform: "win32", homeDir: "C:\\Users\\me", localAppData: "D:\\Local" })).toBe(
      path.join("D:\\Local", "agentlens", "endpoint-secret"),
    );
  });

  it("falls back to the home folder on windows", () => {
    expect(secretFilePath({ platform: "win32", homeDir: "C:\\Users\\me" })).toBe(
      path.join("C:\\Users\\me", "AppData", "Local", "agentlens", "endpoint-secret"),
    );
  });

  it("uses XDG_STATE_HOME elsewhere", () => {
    expect(secretFilePath({ platform: "linux", homeDir: "/home/me", xdgStateHome: "/state" })).toBe(
      path.join("/state", "agentlens", "endpoint-secret"),
    );
  });

  it("falls back to ~/.local/state elsewhere", () => {
    expect(secretFilePath({ platform: "darwin", homeDir: "/Users/me" })).toBe(
      path.join("/Users/me", ".local", "state", "agentlens", "endpoint-secret"),
    );
  });
});

describe("loadOrCreateSecret", () => {
  it("creates a 256-bit hex secret and its folder on first use", () => {
    const file = newSecretFile();
    expect(loadOrCreateSecret(file)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns the same secret afterwards", () => {
    const file = newSecretFile();
    expect(loadOrCreateSecret(file)).toBe(loadOrCreateSecret(file));
  });

  it("creates different secrets for different users", () => {
    expect(loadOrCreateSecret(newSecretFile())).not.toBe(loadOrCreateSecret(newSecretFile()));
  });

  it("leaves no temporary file behind", async () => {
    const file = newSecretFile();
    loadOrCreateSecret(file);
    expect(await readdir(path.dirname(file))).toEqual(["endpoint-secret"]);
  });

  it("keeps a valid secret that another window created first", async () => {
    const file = newSecretFile();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${"c".repeat(64)}\n`, { mode: 0o600 });
    expect(loadOrCreateSecret(file)).toBe("c".repeat(64));
  });

  it("refuses a malformed secret instead of replacing it", async () => {
    const file = newSecretFile();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "not a secret\n", { mode: 0o600 });

    expect(() => loadOrCreateSecret(file)).toThrow(/malformed/);
    expect(await readFile(file, "utf8")).toBe("not a secret\n");
  });

  it("refuses a directory in place of the file", async () => {
    const file = newSecretFile();
    await mkdir(file, { recursive: true });
    expect(() => loadOrCreateSecret(file)).toThrow(/not a regular file/);
  });

  it.skipIf(process.platform === "win32")("creates the file readable only by its owner", async () => {
    const file = newSecretFile();
    loadOrCreateSecret(file);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it.skipIf(process.platform === "win32")("refuses a secret that others can read", async () => {
    const file = newSecretFile();
    loadOrCreateSecret(file);
    await chmod(file, 0o644);
    expect(() => loadOrCreateSecret(file)).toThrow(/readable by others/);
  });
});

describe("readSecret", () => {
  it("returns undefined when the file does not exist and creates nothing", async () => {
    const file = newSecretFile();
    expect(readSecret(file)).toBeUndefined();
    await expect(stat(path.dirname(file))).rejects.toThrow();
  });

  it("returns the secret that the extension created", () => {
    const file = newSecretFile();
    const created = loadOrCreateSecret(file);
    expect(readSecret(file)).toBe(created);
  });

  it("returns undefined for a malformed file", async () => {
    const file = newSecretFile();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "short\n");
    expect(readSecret(file)).toBeUndefined();
  });
});

describe("endpoint names depend on the secret", () => {
  const environment = (secret: string): EndpointEnvironment => ({
    platform: "linux",
    runtimeDir: "/run/user/1000",
    uid: 1000,
    secret,
  });

  it("differs when the secret differs", () => {
    expect(endpointForRoot("/home/me/proj", environment("a".repeat(64)))).not.toBe(
      endpointForRoot("/home/me/proj", environment("b".repeat(64))),
    );
  });

  it("does not contain the secret", () => {
    const secret = "d".repeat(64);
    expect(endpointForRoot("/home/me/proj", environment(secret))).not.toContain(secret.slice(0, 16));
  });

  it("is not the plain hash of the path that an outsider could compute", async () => {
    const { createHash } = await import("node:crypto");
    const plain = createHash("sha256").update("/home/me/proj").digest("hex").slice(0, 16);
    expect(endpointForRoot("/home/me/proj", environment("a".repeat(64)))).not.toContain(plain);
  });
});
