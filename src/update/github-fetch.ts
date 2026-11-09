const REQUEST_TIMEOUT_MS = 5000;
export const MAX_RESPONSE_BYTES = 64 * 1024;

async function readLimited(response: Response): Promise<string> {
  if (response.body === null) {
    return "";
  }
  const reader = response.body.getReader() as ReadableStreamDefaultReader<Uint8Array>;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return Buffer.concat(chunks).toString("utf8");
    }
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error(`response is larger than ${String(MAX_RESPONSE_BYTES)} bytes`);
    }
    chunks.push(value);
  }
}

/**
 * The extension's only network call: one anonymous GET that sends no workspace data. It does not
 * follow redirects, gives up after five seconds and refuses a large body.
 */
export async function fetchJson(url: string, userAgent: string): Promise<unknown> {
  const response = await fetch(url, {
    method: "GET",
    redirect: "manual",
    headers: { Accept: "application/vnd.github+json", "User-Agent": userAgent },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status !== 200) {
    await response.body?.cancel();
    throw new Error(`the server answered HTTP ${String(response.status)}`);
  }
  return JSON.parse(await readLimited(response)) as unknown;
}
