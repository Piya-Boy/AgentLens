import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fetchJson, MAX_RESPONSE_BYTES } from "./github-fetch";

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

let server: Server;
let baseUrl: string;
let handler: Handler = () => undefined;
let lastRequest: IncomingMessage | undefined;

beforeAll(async () => {
  server = createServer((request, response) => {
    lastRequest = request;
    handler(request, response);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/latest`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
    server.closeAllConnections();
  });
});

describe("fetchJson", () => {
  it("returns the parsed body of a 200 answer", async () => {
    handler = (_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ tag_name: "v1.0.0" }));
    };

    expect(await fetchJson(baseUrl, "AgentLens/9.9.9")).toEqual({ tag_name: "v1.0.0" });
  });

  it("sends a GET with the user agent and nothing that identifies the user or the workspace", async () => {
    handler = (_request, response) => {
      response.end("{}");
    };

    await fetchJson(baseUrl, "AgentLens/9.9.9");

    expect(lastRequest?.method).toBe("GET");
    expect(lastRequest?.headers["user-agent"]).toBe("AgentLens/9.9.9");
    expect(lastRequest?.headers.accept).toBe("application/vnd.github+json");
    expect(lastRequest?.headers.cookie).toBeUndefined();
    expect(lastRequest?.headers.authorization).toBeUndefined();
  });

  it("fails on a status other than 200", async () => {
    handler = (_request, response) => {
      response.writeHead(404);
      response.end("not found");
    };

    await expect(fetchJson(baseUrl, "AgentLens/9.9.9")).rejects.toThrow("HTTP 404");
  });

  it("does not follow a redirect", async () => {
    handler = (_request, response) => {
      response.writeHead(302, { Location: "http://127.0.0.1:1/elsewhere" });
      response.end();
    };

    await expect(fetchJson(baseUrl, "AgentLens/9.9.9")).rejects.toThrow("HTTP 302");
  });

  it("refuses a body above the size limit", async () => {
    handler = (_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ filler: "x".repeat(MAX_RESPONSE_BYTES) }));
    };

    await expect(fetchJson(baseUrl, "AgentLens/9.9.9")).rejects.toThrow("larger than");
  });

  it("fails on a body that is not JSON", async () => {
    handler = (_request, response) => {
      response.end("<html>");
    };

    await expect(fetchJson(baseUrl, "AgentLens/9.9.9")).rejects.toThrow();
  });
});
