import nodePath from "node:path";
import { describe, expect, it } from "vitest";
import { directoryChain, endpointForRoot, socketDirectory, type EndpointEnvironment } from "./endpoint";

const linux: EndpointEnvironment = { platform: "linux", runtimeDir: "/run/user/1000", uid: 1000 };
const windows: EndpointEnvironment = { platform: "win32", runtimeDir: "C:\\Temp", uid: 0 };

describe("endpointForRoot", () => {
  it("is stable for the same root", () => {
    expect(endpointForRoot("/home/me/proj", linux)).toBe(endpointForRoot("/home/me/proj", linux));
  });

  it("differs per root", () => {
    expect(endpointForRoot("/home/me/a", linux)).not.toBe(endpointForRoot("/home/me/b", linux));
  });

  it("uses a socket inside a per-user directory on unix", () => {
    const endpoint = endpointForRoot("/home/me/proj", linux);
    expect(endpoint.startsWith(socketDirectory(linux) + nodePath.sep)).toBe(true);
    expect(endpoint.endsWith(".sock")).toBe(true);
    expect(socketDirectory(linux)).toBe(nodePath.join("/run/user/1000", "agentlens-1000"));
  });

  it("keeps socket paths short enough for the unix limit", () => {
    expect(endpointForRoot("/home/me/proj", linux).length).toBeLessThan(100);
  });

  it("uses a named pipe on windows and ignores drive letter case", () => {
    const upper = endpointForRoot("C:\\Users\\Me\\Proj", windows);
    expect(upper.startsWith("\\\\.\\pipe\\agentlens-")).toBe(true);
    expect(upper).toBe(endpointForRoot("c:\\users\\me\\proj", windows));
  });

  it("is case sensitive on unix", () => {
    expect(endpointForRoot("/home/me/Proj", linux)).not.toBe(endpointForRoot("/home/me/proj", linux));
  });
});

describe("directoryChain", () => {
  it("lists the directory and its ancestors deepest first (posix)", () => {
    expect(directoryChain("/a/b/c", nodePath.posix)).toEqual(["/a/b/c", "/a/b", "/a", "/"]);
  });

  it("stops at the drive root (win32)", () => {
    expect(directoryChain("C:\\a\\b", nodePath.win32)).toEqual(["C:\\a\\b", "C:\\a", "C:\\"]);
  });

  it("handles the root itself", () => {
    expect(directoryChain("/", nodePath.posix)).toEqual(["/"]);
  });
});
