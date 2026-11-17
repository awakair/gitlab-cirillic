import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { repository } from "./helpers.js";

async function environment(repositories, origins) {
  const handlers = {};
  const registrations = new Map();
  const event = (name) => ({
    addListener: (callback) => {
      handlers[name] = callback;
    },
  });
  const browser = {
    storage: {
      local: { get: async () => ({ repositories }) },
      onChanged: event("storage"),
    },
    permissions: {
      contains: async ({ origins: requested }) =>
        requested.every((origin) => origins.has(origin)),
      onRemoved: event("permissionRemoved"),
    },
    scripting: {
      getRegisteredContentScripts: async () => [...registrations.values()],
      registerContentScripts: async (items) => {
        for (const item of items) registrations.set(item.id, item);
      },
      updateContentScripts: async (items) => {
        for (const item of items) registrations.set(item.id, item);
      },
      unregisterContentScripts: async ({ ids }) => {
        for (const id of ids) registrations.delete(id);
      },
    },
    runtime: {
      id: "test-extension",
      getURL: (path) => `moz-extension://test/${path}`,
      onMessage: event("message"),
      onInstalled: event("installed"),
      onStartup: event("startup"),
    },
  };
  const output = await build({
    entryPoints: [new URL("../src/background.js", import.meta.url).pathname],
    bundle: true,
    write: false,
    format: "iife",
  });
  runInNewContext(output.outputFiles[0].text, {
    browser,
    crypto,
    TextEncoder,
    URL,
    console,
  });
  return {
    registrations,
    repositories,
    origins,
    handlers,
    synchronize: () =>
      handlers.message(
        { type: "synchronize" },
        { id: "test-extension", url: "moz-extension://test/popup.html" },
      ),
  };
}

test("registers only allowlisted repositories with granted site access", async () => {
  const env = await environment(
    {
      [repository]: { encoding: "auto" },
      "https://other.example.org/g/p": { encoding: "auto" },
    },
    new Set(["https://gitlab.example.org/*"]),
  );
  await env.synchronize();
  assert.equal(env.registrations.size, 1);
  const [registration] = env.registrations.values();
  assert.deepEqual(
    [...registration.matches],
    [repository, `${repository}/-/*`],
  );
  await env.synchronize();
  assert.equal(env.registrations.size, 1);
});

test("upgrades existing registrations to include ordinary file views", async () => {
  const env = await environment(
    { [repository]: { encoding: "auto" } },
    new Set(["https://gitlab.example.org/*"]),
  );
  await env.synchronize();
  const [registration] = env.registrations.values();
  registration.matches = [`${repository}/-/merge_requests/*`];
  await env.synchronize();
  assert.equal(env.registrations.size, 1);
  assert.ok(
    env.registrations
      .get(registration.id)
      .matches.includes(`${repository}/-/*`),
  );
});

test("unregisters scripts when a repository is removed or site access is revoked", async () => {
  const env = await environment(
    { [repository]: { encoding: "auto" } },
    new Set(["https://gitlab.example.org/*"]),
  );
  await env.synchronize();
  delete env.repositories[repository];
  await env.synchronize();
  assert.equal(env.registrations.size, 0);
  env.repositories[repository] = { encoding: "auto" };
  await env.synchronize();
  assert.equal(env.registrations.size, 1);
  env.origins.clear();
  await env.synchronize();
  assert.equal(env.registrations.size, 0);
});

test("does not accept synchronization messages from page content", async () => {
  const env = await environment({}, new Set());
  assert.equal(
    env.handlers.message(
      { type: "synchronize" },
      { id: "test-extension", url: repository },
    ),
    undefined,
  );
});
