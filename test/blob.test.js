import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { blobSourceInfo, blobLinePosition } from "../src/content/blob.js";
import { PageController } from "../src/content/controller.js";
import { SourceCache } from "../src/content/source-cache.js";
import { repository, encodeSingleByte, tick, until } from "./helpers.js";

const blobId = "3".repeat(40);
const projectPath = "group/subgroup/project";
const path = "src/example.php";
const url = `${repository}/-/blob/feature/encoding/${path}`;
const raw = `/api/v4/projects/group%2Fsubgroup%2Fproject/repository/blobs/${blobId}/raw`;
const metadata = (overrides = {}) => ({
  id: `gid://gitlab/Blob/${blobId}`,
  path,
  webPath: new URL(url).pathname,
  ...overrides,
});

function chunk(number, text = "// ") {
  // GitLab SourceViewer renders separate chunks, each with its own code block.
  return `<div><a id="L${number}" data-line-number="${number}">${number}</a><pre><code><div class="line" id="LC${number}"><span class="c1">${text}</span></div></code></pre></div>`;
}

async function environment({
  enabled = true,
  source = "// Привет",
  encoding = "auto",
  html = chunk(1),
  initialUrl = url,
  fetchSource,
} = {}) {
  const dom = new JSDOM(
    `<body><div class="blob-viewer"><div><div class="file-content blob-content" data-path="${path}">${html}</div></div></div></body>`,
    { url: initialUrl },
  );
  const { window } = dom;
  const calls = [],
    logs = [],
    warnings = [],
    listeners = [];
  let repositories = enabled ? { [repository]: { encoding } } : {};
  window.fetch = async (request, options) => {
    calls.push({ request, options });
    return fetchSource
      ? fetchSource(request, options)
      : new Response(encodeSingleByte(source));
  };
  window.console.info = (...args) => logs.push(args);
  window.console.warn = (...args) => warnings.push(args);
  const viewer = window.document.querySelector(".blob-viewer");
  const file = window.document.querySelector(".blob-content");
  viewer.__vue__ = {
    $props: { blob: metadata(), projectPath, currentRef: "feature/encoding" },
  };
  const api = {
    storage: {
      local: { get: async () => ({ repositories }) },
      onChanged: { addListener: (listener) => listeners.push(listener) },
    },
    runtime: { onMessage: { addListener() {} } },
  };
  const controller = new PageController(window, api);
  await controller.start();
  return {
    window,
    viewer,
    file,
    calls,
    logs,
    warnings,
    controller,
    async disable() {
      repositories = {};
      listeners.forEach((listener) => listener({ repositories: {} }, "local"));
      await tick(10);
    },
    close() {
      controller.stop();
      window.close();
    },
  };
}

test("blob URLs use the immutable content ID, including branches with slashes", () => {
  const info = blobSourceInfo(metadata(), projectPath, new URL(url));
  assert.equal(info.new, raw);
  assert.equal(info.old, null);
  assert.ok(!info.new.includes("feature"));
});

test("blob requests support GitLab mounted below a URL prefix", () => {
  const location = new URL(url.replace(".org/", ".org/gitlab/"));
  const info = blobSourceInfo(
    metadata({ webPath: location.pathname }),
    projectPath,
    location,
  );
  assert.equal(info.new, `/gitlab${raw}`);
});

test("blob metadata must match the displayed repository, path and page", () => {
  for (const changes of [
    { id: "main" },
    { webPath: "https://other.example.org/a" },
    { webPath: new URL(url).pathname.replace("feature/encoding", "main") },
    { path: "../example.php" },
    { path: "another.php" },
    { binary: true },
    { storedExternally: true },
  ])
    assert.equal(
      blobSourceInfo(metadata(changes), projectPath, new URL(url)),
      null,
    );
  assert.equal(blobSourceInfo(metadata(), "other/project", new URL(url)), null);
  assert.equal(
    blobSourceInfo(
      metadata(),
      projectPath,
      new URL(`${repository}/-/issues/1`),
    ),
    null,
  );
});

test("blob line positions use code line IDs, never gutter labels", () => {
  assert.deepEqual(blobLinePosition({ id: "LC101" }), {
    side: "new",
    number: 101,
  });
  for (const id of ["L1", "LC0", "LC-1", "LC1x", "LC999999999999999999999"])
    assert.equal(blobLinePosition({ id }), null);
});

test("SourceCache accepts same-origin blob raw endpoints and rejects mutable or external URLs", async () => {
  const cache = new SourceCache(
    new URL(url).origin,
    async () => new Response(encodeSingleByte("// Привет")),
  );
  assert.equal((await cache.get(raw, "windows-1251")).kind, "legacy");
  await assert.rejects(
    cache.get(raw.replace(blobId, "main"), "auto"),
    /Unexpected/,
  );
  await assert.rejects(
    cache.get(`https://other.example.org${raw}`, "auto"),
    /Unexpected/,
  );
});

test("ordinary file view restores text and disabling returns the original markup", async () => {
  const env = await environment();
  try {
    const line = env.file.querySelector("#LC1");
    const original = line.innerHTML;
    const gutter = env.file.querySelector("#L1");
    await until(() => line.textContent === "// Привет");
    assert.equal(env.calls.length, 1);
    assert.equal(env.calls[0].request, new URL(raw, url).href);
    assert.equal(env.file.querySelector("#L1"), gutter);
    await env.disable();
    assert.equal(line.innerHTML, original);
    assert.equal(env.controller.status().restored, 0);
  } finally {
    env.close();
  }
});

test("blob view is inactive outside the repository allowlist", async () => {
  const env = await environment({ enabled: false });
  try {
    env.file.insertAdjacentHTML("beforeend", chunk(2));
    await tick(200);
    assert.equal(env.calls.length, 0);
    assert.equal(env.file.querySelector("#LC1").textContent, "// ");
  } finally {
    env.close();
  }
});

test("UTF-8 blob content is checked once without rewriting lines", async () => {
  const env = await environment({
    html: chunk(1, "// Привет"),
    fetchSource: async () => new Response("// Привет"),
  });
  try {
    const original = env.file.querySelector("#LC1").firstChild;
    await until(() => env.calls.length === 1);
    env.file.insertAdjacentHTML("beforeend", chunk(2));
    await tick(200);
    assert.equal(env.calls.length, 1);
    assert.equal(env.file.querySelector("#LC1").firstChild, original);
    assert.equal(env.logs.length, 0);
  } finally {
    env.close();
  }
});

test("lazy blob chunks reuse the downloaded content and insert text safely", async () => {
  const env = await environment({
    source: "// Привет\n// <img src=x onerror=alert(1)> русский",
  });
  try {
    await until(() => env.controller.status().restored === 1);
    env.file.insertAdjacentHTML(
      "beforeend",
      chunk(2, "// &lt;img src=x onerror=alert(1)&gt; "),
    );
    await until(() => env.controller.status().restored === 2);
    assert.equal(env.calls.length, 1);
    assert.equal(env.file.querySelector("img"), null);
  } finally {
    env.close();
  }
});

test("in-flight blob responses cannot modify another displayed file version", async () => {
  let release;
  const env = await environment({
    fetchSource: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  try {
    await until(() => release);
    env.viewer.__vue__.$props.blob = metadata({
      id: `gid://gitlab/Blob/${"4".repeat(40)}`,
    });
    release(new Response(encodeSingleByte("// Привет")));
    await tick(80);
    assert.equal(env.file.querySelector("#LC1").textContent, "// ");
  } finally {
    env.close();
  }
});

test("client-side tree-to-blob navigation starts checking only on the file page", async () => {
  const env = await environment({ initialUrl: `${repository}/-/tree/main` });
  try {
    await tick(150);
    assert.equal(env.calls.length, 0);
    env.window.history.pushState({}, "", url);
    env.window.document.body.append(env.window.document.createElement("nav"));
    await until(() => env.controller.status().restored === 1);
    assert.equal(env.calls.length, 1);
  } finally {
    env.close();
  }
});

test("navigation invalidates pending blob requests before new metadata arrives", async () => {
  let release;
  const env = await environment({
    fetchSource: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  try {
    await until(() => release);
    env.window.history.pushState(
      {},
      "",
      `${repository}/-/blob/main/another.php`,
    );
    release(new Response(encodeSingleByte("// Привет")));
    await tick(80);
    assert.equal(env.file.querySelector("#LC1").textContent, "// ");
  } finally {
    env.close();
  }
});

test("unknown blob metadata makes no speculative branch request", async () => {
  const env = await environment();
  try {
    delete env.viewer.__vue__;
    await until(() => env.warnings.length === 1);
    assert.equal(env.calls.length, 0);
  } finally {
    env.close();
  }
});
