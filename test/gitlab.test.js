import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { sourceInfo, linePosition } from "../src/content/gitlab.js";
import {
  repositoryFromUrl,
  mergeRequestRepository,
  readRepositories,
} from "../src/shared/repositories.js";
import { base, head, url, repository, metadata, lineHTML } from "./helpers.js";

test("repository keys work across hosts, nested groups, ports and GitLab prefixes", () => {
  assert.equal(repositoryFromUrl(url).key, repository);
  assert.equal(repositoryFromUrl(`${repository}.git`).key, repository);
  assert.equal(
    repositoryFromUrl("http://localhost:8080/gitlab/group/project/-/tree/main")
      .key,
    "http://localhost:8080/gitlab/group/project",
  );
  assert.equal(mergeRequestRepository(`${repository}/-/issues/3`), null);
  for (const invalid of [
    "file:///group/project",
    "https://user:secret@example.org/g/p",
    "https://example.org/group",
    "not a URL",
    "https://example.org/g/*",
  ]) {
    assert.equal(repositoryFromUrl(invalid), null);
  }
});

test("storage is opt-in and malformed allowlist entries are ignored", async () => {
  assert.deepEqual(await readRepositories({ get: async () => ({}) }), {});
  assert.deepEqual(
    await readRepositories({
      get: async () => ({
        repositories: { bad: {}, [repository]: { encoding: "auto" } },
      }),
    }),
    { [repository]: { encoding: "auto" } },
  );
});

test("immutable raw URLs preserve old/new paths and fork repositories", () => {
  const info = sourceInfo(
    metadata({ old_path: "old name.php", new_path: "new#name.php" }),
    new URL(url),
  );
  assert.equal(
    info.old,
    `/group/subgroup/project/-/raw/${base}/old%20name.php`,
  );
  assert.equal(
    info.new,
    `/group/subgroup/project/-/raw/${head}/new%23name.php`,
  );
  assert.equal(
    sourceInfo(metadata({ new_file: true }), new URL(url)).old,
    null,
  );
  assert.equal(
    sourceInfo(metadata({ deleted_file: true }), new URL(url)).new,
    null,
  );
  assert.equal(
    sourceInfo(
      metadata({ view_path: `/fork/project/-/blob/${head}/a` }),
      new URL(url),
    ).new,
    `/fork/project/-/raw/${head}/src/example.php`,
  );
});

test("rejects untrusted paths, mutable revisions, external hosts and submodules", () => {
  for (const change of [
    { view_path: `https://other.example.org/g/p/-/blob/${head}/a` },
    { view_path: `/g/p/-/blob/${"3".repeat(40)}/a` },
    { diff_refs: { head_sha: "main", base_sha: base } },
    { new_path: "../a" },
    { new_path: "a\\b" },
    { submodule: true },
    { stored_externally: true },
  ])
    assert.equal(sourceInfo(metadata(change), new URL(url)), null);
});

test("maps additions, deletions and context in inline and side-by-side diffs", () => {
  for (const [old, next, type, side, parallel, expectedSide, number] of [
    [0, 4, "new", "left", false, "new", 4],
    [3, 0, "old", "left", false, "old", 3],
    [3, 4, "", "left", false, "new", 4],
    [3, 4, "", "left", true, "old", 3],
    [3, 4, "", "right", true, "new", 4],
  ]) {
    const dom = new JSDOM(lineHTML(old, next, type, side, parallel));
    assert.deepEqual(
      linePosition(dom.window.document.querySelector(".line_content")),
      { side: expectedSide, number },
    );
    dom.window.close();
  }
});
