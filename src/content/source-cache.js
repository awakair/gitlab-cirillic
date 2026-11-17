import { decodeSource } from "./encoding.js";

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_SOURCES = 128;

async function readBounded(response) {
  if (Number(response.headers.get("content-length")) > MAX_FILE_BYTES) {
    await response.body?.cancel();
    throw new Error("Raw file exceeds 4 MiB");
  }
  if (!response.body) throw new Error("Raw response has no body");
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_FILE_BYTES) throw new Error("Raw file exceeds 4 MiB");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/** Immutable URLs and failed requests are cached for the lifetime of the page. */
export class SourceCache {
  constructor(origin, fetchSource = globalThis.fetch) {
    this.origin = origin;
    this.fetchSource = fetchSource;
    this.records = new Map();
    this.controllers = new Set();
    this.totalBytes = 0;
  }

  async load(path) {
    const url = new URL(path, this.origin);
    if (
      url.origin !== this.origin ||
      !(
        /\/-\/raw\/[a-f0-9]{40,64}\//i.test(url.pathname) ||
        /\/api\/v4\/projects\/[^/]+\/repository\/blobs\/[a-f0-9]{40,64}\/raw$/i.test(
          url.pathname,
        )
      )
    ) {
      throw new Error("Unexpected raw source URL");
    }
    const controller = new AbortController();
    this.controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await this.fetchSource(url.href, {
        credentials: "same-origin",
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Raw request failed: HTTP ${response.status}`);
      }
      if (/text\/html/i.test(response.headers.get("content-type") || "")) {
        await response.body?.cancel();
        throw new Error("Raw request returned an HTML page");
      }
      const bytes = await readBounded(response);
      if (this.totalBytes + bytes.length > MAX_TOTAL_BYTES)
        throw new Error("Page source cache exceeds 32 MiB");
      this.totalBytes += bytes.length;
      return { bytes, decoded: null };
    } finally {
      clearTimeout(timeout);
      this.controllers.delete(controller);
    }
  }

  async get(path, encoding) {
    if (!path) return null;
    if (!this.records.has(path)) {
      if (this.records.size >= MAX_SOURCES)
        throw new Error("Page source cache exceeds 128 revisions");
      this.records.set(path, this.load(path));
    }
    const record = await this.records.get(path);
    if (
      record.decoded?.result.kind === "utf8" ||
      record.decoded?.encoding === encoding
    )
      return record.decoded.result;
    const result = decodeSource(record.bytes, encoding);
    record.decoded = { encoding, result };
    if (result.kind === "utf8") {
      this.totalBytes -= record.bytes.length;
      record.bytes = null;
    }
    return result;
  }

  abortPending() {
    for (const controller of this.controllers) controller.abort();
  }
}
