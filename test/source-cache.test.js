import { test } from "node:test";
import assert from "node:assert/strict";
import { SourceCache } from "../src/content/source-cache.js";
import { head, encodeSingleByte } from "./helpers.js";

const path = `/group/project/-/raw/${head}/file.php`;

test("deduplicates concurrent requests and redecodes without downloading again", async () => {
  let calls = 0;
  const cache = new SourceCache(
    "https://gitlab.example.org",
    async (url, options) => {
      calls++;
      assert.equal(options.credentials, "same-origin");
      assert.equal(options.redirect, "error");
      return new Response(encodeSingleByte("// Привет"));
    },
  );
  const [first, second] = await Promise.all([
    cache.get(path, "windows-1251"),
    cache.get(path, "windows-1251"),
  ]);
  assert.equal(first, second);
  await cache.get(path, "koi8-r");
  assert.equal(calls, 1);
});

test("UTF-8 is cached without retaining source bytes", async () => {
  const cache = new SourceCache(
    "https://gitlab.example.org",
    async () => new Response("// Привет"),
  );
  assert.equal((await cache.get(path, "auto")).kind, "utf8");
  assert.equal(cache.totalBytes, 0);
  assert.equal((await cache.get(path, "koi8-r")).kind, "utf8");
});

test("failed requests are cached rather than retried on every DOM change", async () => {
  let calls = 0;
  const cache = new SourceCache("https://gitlab.example.org", async () => {
    calls++;
    return new Response("", { status: 403 });
  });
  await assert.rejects(cache.get(path, "auto"), /403/);
  await assert.rejects(cache.get(path, "auto"), /403/);
  assert.equal(calls, 1);
});

test("rejects external URLs and HTML login responses", async () => {
  const cache = new SourceCache(
    "https://gitlab.example.org",
    async () =>
      new Response("<html>Login</html>", {
        headers: { "content-type": "text/html" },
      }),
  );
  await assert.rejects(
    cache.get(`https://other.example.org${path}`, "auto"),
    /Unexpected/,
  );
  await assert.rejects(cache.get(path, "auto"), /HTML/);
});

test("enforces the streamed size limit without trusting Content-Length", async () => {
  const bytes = new Uint8Array(4 * 1024 * 1024 + 1);
  const cache = new SourceCache(
    "https://gitlab.example.org",
    async () => new Response(bytes),
  );
  await assert.rejects(cache.get(path, "auto"), /4 MiB/);
});
