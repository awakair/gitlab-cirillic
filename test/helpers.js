import assert from "node:assert/strict";

export const head = "1".repeat(40);
export const base = "2".repeat(40);
export const repository = "https://gitlab.example.org/group/subgroup/project";
export const url = `${repository}/-/merge_requests/7/diffs`;

export function encodeSingleByte(text, encoding = "windows-1251") {
  const decoder = new TextDecoder(encoding);
  const map = new Map(
    Array.from({ length: 256 }, (_, byte) => [
      decoder.decode(Uint8Array.of(byte)),
      byte,
    ]),
  );
  return Uint8Array.from(
    [...text].map((character) => {
      assert.ok(map.has(character), `${encoding} cannot encode ${character}`);
      return map.get(character);
    }),
  );
}

export function metadata(overrides = {}) {
  return {
    new_path: "src/example.php",
    old_path: "src/example.php",
    diff_refs: { head_sha: head, base_sha: base },
    ...overrides,
  };
}

export function lineHTML(
  old,
  next,
  type,
  side = "left",
  parallel = false,
  shown = "// ",
) {
  return `<div class="diff-grid-${side}" id="hash_${old}_${next}" data-interop-type="${type}">
    <div class="diff-line-num"><a data-linenumber="${next || old}"></a></div>
    <div class="line_content ${side}-side ${type} ${parallel ? "parallel" : ""}"><span class="line"><span class="c1">${shown}</span></span></div></div>`;
}

export const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function until(predicate) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await tick(20);
  }
  assert.fail("Timed out waiting for diff repair");
}
