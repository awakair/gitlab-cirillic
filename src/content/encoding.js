import { detect } from "jschardet";

const utf8 = new TextDecoder("utf-8", { fatal: true });
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000e-\u001f\u007f-\u009f]/;
const MIN_CONFIDENCE = 0.9;
const SAMPLE_SIZE = 256 * 1024;

function byteString(bytes) {
  // A long ASCII preamble must not hide the only legacy-encoded comment.
  const firstNonAscii = bytes.findIndex((byte) => byte >= 0x80);
  const start = Math.max(0, firstNonAscii - 1024);
  const end = Math.min(bytes.length, start + SAMPLE_SIZE);
  let value = "";
  // Avoid overflowing the argument stack for large files.
  for (let offset = start; offset < end; offset += 8192) {
    value += String.fromCharCode(
      ...bytes.subarray(offset, Math.min(offset + 8192, end)),
    );
  }
  return value;
}

/** Inspect actual bytes, never a guessed charset from GitLab's HTTP headers. */
export function decodeSource(bytes, requested = "auto") {
  try {
    utf8.decode(bytes);
    return { kind: "utf8" };
  } catch {
    // Continue only if strict UTF-8 decoding fails.
  }

  const bomEncoding =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? "utf-16le"
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? "utf-16be"
        : null;
  if (bytes.includes(0) && !bomEncoding && !requested.startsWith("utf-16")) {
    return { kind: "binary" };
  }
  let encoding = requested;
  let confidence = 1;
  if (requested === "auto") {
    if (bomEncoding) encoding = bomEncoding;
    else {
      const detected = detect(byteString(bytes));
      encoding = detected.encoding;
      confidence = detected.confidence;
      if (
        !encoding ||
        /^(ascii|utf-?8)$/i.test(encoding) ||
        confidence < MIN_CONFIDENCE
      )
        return { kind: "uncertain" };
    }
  }
  try {
    const decoder = new TextDecoder(encoding, { fatal: true });
    const text = decoder.decode(bytes);
    if (CONTROL_CHARACTERS.test(text) || text.includes("\ufffd"))
      return { kind: "binary" };
    return {
      kind: "legacy",
      encoding: decoder.encoding,
      confidence,
      lines: text.split(/\r\n|\n|\r/),
    };
  } catch {
    return { kind: "unsupported" };
  }
}

/** Identical lines and unrelated code must never be rewritten. */
export function canRestore(shown, original) {
  if (
    typeof original !== "string" ||
    shown === original ||
    !/[^\x00-\x7f]/.test(original)
  )
    return false;
  const ascii = (text) => text.replace(/[^\x00-\x7f]/g, "");
  if (ascii(shown) !== ascii(original)) return false;
  // GitLab either removed non-ASCII characters or replaced them with U+FFFD.
  // Preserve already-readable non-ASCII text rather than guessing mojibake.
  return /^[\x00-\x7f\ufffd]*$/.test(shown);
}
