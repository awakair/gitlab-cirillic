import { test } from "node:test";
import assert from "node:assert/strict";
import { canRestore, decodeSource } from "../src/content/encoding.js";
import { encodeSingleByte } from "./helpers.js";

const russian =
  "// Привет, мир! Проверяем русский комментарий и кодировку файла.\r\n";
for (const encoding of ["windows-1251", "koi8-r", "ibm866", "iso-8859-5"]) {
  test(`auto-detects ${encoding}`, () => {
    const result = decodeSource(encodeSingleByte(russian, encoding));
    assert.equal(result.kind, "legacy");
    assert.equal(result.encoding, encoding);
    assert.deepEqual(result.lines, [russian.trimEnd(), ""]);
  });
}

for (const [encoding, text] of [
  ["koi8-u", "// Український коментар: їжак, ґанок, єнот, ідея"],
  ["windows-1252", "// français, déjà vu, café"],
  ["windows-1250", "// Příliš žluťoučký kůň"],
  ["windows-1253", "// Ελληνικό κείμενο"],
  ["windows-1256", "// العربية"],
]) {
  test(`explicitly decodes ${encoding}`, () => {
    const result = decodeSource(encodeSingleByte(text, encoding), encoding);
    assert.equal(result.kind, "legacy");
    assert.deepEqual(result.lines, [text]);
  });
}

test("UTF-8 and ASCII skip legacy detection even with an explicit override", () => {
  for (const text of ["", "// plain", "// Привет", "// 日本語"]) {
    for (const encoding of ["auto", "windows-1251", "koi8-r"]) {
      assert.deepEqual(decodeSource(new TextEncoder().encode(text), encoding), {
        kind: "utf8",
      });
    }
  }
});

test("binary and unsupported encodings are left untouched", () => {
  assert.equal(decodeSource(Uint8Array.of(0, 255, 128)).kind, "binary");
  assert.equal(
    decodeSource(Uint8Array.of(255), "not-an-encoding").kind,
    "unsupported",
  );
  assert.notEqual(decodeSource(Uint8Array.of(0x81)).kind, "legacy");
});

test("UTF-16 with a byte order mark is recognized", () => {
  const bytes = new Uint8Array(Buffer.from("\ufeff// Привет", "utf16le"));
  assert.deepEqual(decodeSource(bytes).lines, ["// Привет"]);
});

test("a long ASCII preamble does not hide a legacy-encoded comment", () => {
  const text = "// plain ASCII\n".repeat(22000) + russian;
  const result = decodeSource(encodeSingleByte(text));
  assert.equal(result.kind, "legacy");
  assert.equal(result.encoding, "windows-1251");
  assert.equal(result.lines.at(-2), russian.trimEnd());
});

test("restoration requires exact surviving ASCII and never overwrites readable Unicode", () => {
  assert.equal(canRestore("//  API, .", "// Русский API, комментарий."), true);
  assert.equal(canRestore("// �", "// Русский"), true);
  assert.equal(
    canRestore("return foo(); // ", "return bar(); // Русский"),
    false,
  );
  assert.equal(canRestore("// Русский", "// Другой"), false);
  assert.equal(canRestore("// français", "// français"), false);
  assert.equal(canRestore("// plain", "// plain"), false);
  assert.equal(canRestore("// русский ", "// русский текст"), false);
});
