import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { PageController } from "../src/content/controller.js";
import {
  head,
  base,
  url,
  repository,
  metadata,
  lineHTML,
  encodeSingleByte,
  tick,
  until,
} from "./helpers.js";

async function environment({
  html = lineHTML(0, 1, "new"),
  enabled = true,
  source = "// Привет",
  fetchSource,
  encoding = "windows-1251",
} = {}) {
  const dom = new JSDOM(
    `<body><div class="diff-file file-holder">${html}</div></body>`,
    { url },
  );
  const window = dom.window;
  const logs = [],
    warnings = [],
    calls = [],
    listeners = [];
  let repositories = enabled ? { [repository]: { encoding } } : {};
  window.console.info = (...args) => logs.push(args);
  window.console.warn = (...args) => warnings.push(args);
  window.fetch = async (request, options) => {
    calls.push({ request, options });
    return fetchSource
      ? fetchSource(request, options)
      : new Response(
          encodeSingleByte(
            source,
            encoding === "auto" ? "windows-1251" : encoding,
          ),
        );
  };
  const api = {
    storage: {
      local: { get: async () => ({ repositories }) },
      onChanged: { addListener: (listener) => listeners.push(listener) },
    },
    runtime: { onMessage: { addListener() {} } },
  };
  const file = window.document.querySelector(".diff-file");
  file.__vue__ = { $props: { file: metadata({ new_file: true }) } };
  const controller = new PageController(window, api);
  await controller.start();
  return {
    window,
    file,
    controller,
    calls,
    logs,
    warnings,
    async setRepositories(value) {
      repositories = value;
      for (const listener of listeners) listener({ repositories: {} }, "local");
      await tick(10);
    },
    close() {
      controller.stop();
      window.close();
    },
  };
}

test("disabled repositories make zero network requests and leave the DOM intact", async () => {
  const env = await environment({ enabled: false });
  try {
    env.file.insertAdjacentHTML("beforeend", lineHTML(0, 2, "new"));
    await tick(220);
    assert.equal(env.calls.length, 0);
    assert.equal(env.controller.status().restored, 0);
  } finally {
    env.close();
  }
});

test("restores a diff, preserves discussion controls and reverses on removal from allowlist", async () => {
  const env = await environment();
  try {
    const line = env.file.querySelector(".line");
    const original = line.innerHTML;
    const gutter = env.file.querySelector(".diff-line-num");
    await until(() => line.textContent === "// Привет");
    assert.equal(env.file.querySelector(".diff-line-num"), gutter);
    assert.equal(env.calls.length, 1);
    assert.equal(env.logs.length, 1);
    await env.setRepositories({});
    assert.equal(line.innerHTML, original);
    await env.setRepositories({ [repository]: { encoding: "windows-1251" } });
    await until(() => line.textContent === "// Привет");
    assert.equal(env.calls.length, 1);
  } finally {
    env.close();
  }
});

test("checks UTF-8 once and performs no DOM writes or restoration logs", async () => {
  const env = await environment({
    html: lineHTML(0, 1, "new", "left", false, "// Привет"),
    fetchSource: async () => new Response("// Привет"),
  });
  try {
    const line = env.file.querySelector(".line");
    const original = line.firstChild;
    await until(() => env.calls.length === 1);
    await tick(100);
    env.file.insertAdjacentHTML("beforeend", "<div>Unrelated</div>");
    await tick(180);
    assert.equal(env.calls.length, 1);
    assert.equal(line.firstChild, original);
    assert.equal(env.logs.length, 0);
  } finally {
    env.close();
  }
});

test("already-readable legacy text remains untouched", async () => {
  const env = await environment({
    html: lineHTML(0, 1, "new", "left", false, "// Привет"),
  });
  try {
    const original = env.file.querySelector(".line").firstChild;
    await until(() => env.calls.length === 1);
    await tick(100);
    assert.equal(env.file.querySelector(".line").firstChild, original);
    assert.equal(env.logs.length, 0);
  } finally {
    env.close();
  }
});

test("lazy-loaded rows reuse bytes and repository text is never interpreted as HTML", async () => {
  const env = await environment({
    source: "// Привет\n// <img src=x onerror=alert(1)> русский",
  });
  try {
    await until(() => env.controller.status().restored === 1);
    env.file.insertAdjacentHTML(
      "beforeend",
      lineHTML(
        0,
        2,
        "new",
        "left",
        false,
        "// &lt;img src=x onerror=alert(1)&gt; ",
      ),
    );
    await until(() => env.controller.status().restored === 2);
    assert.equal(env.file.querySelector("img"), null);
    assert.equal(env.calls.length, 1);
  } finally {
    env.close();
  }
});

test("in-flight results cannot overwrite a different displayed revision", async () => {
  let release;
  const env = await environment({
    fetchSource: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  try {
    await until(() => release);
    env.file.__vue__.$props.file = metadata({
      new_file: true,
      diff_refs: { base_sha: base, head_sha: "3".repeat(40) },
    });
    release(new Response(encodeSingleByte("// Привет")));
    await tick(100);
    assert.equal(env.file.querySelector(".line").textContent, "// ");
  } finally {
    env.close();
  }
});

test("in-flight results cannot overwrite a reused diff row", async () => {
  let release;
  const env = await environment({
    fetchSource: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  try {
    await until(() => release);
    env.file.querySelector(".diff-grid-left").id = "hash_0_2";
    release(new Response(encodeSingleByte("// Привет")));
    await tick(100);
    assert.equal(env.file.querySelector(".line").textContent, "// ");
  } finally {
    env.close();
  }
});

test("encoding changes reuse downloaded bytes", async () => {
  const env = await environment();
  try {
    await until(() => env.controller.status().restored === 1);
    await env.setRepositories({ [repository]: { encoding: "auto" } });
    await until(() => env.controller.status().restored === 1);
    assert.equal(env.calls.length, 1);
    assert.ok(env.calls[0].request.includes(head));
  } finally {
    env.close();
  }
});

test("missing metadata never triggers a guessed API request", async () => {
  const env = await environment();
  try {
    delete env.file.__vue__;
    await until(() => env.warnings.length === 1);
    assert.equal(env.calls.length, 0);
    assert.equal(env.controller.status().restored, 0);
  } finally {
    env.close();
  }
});
