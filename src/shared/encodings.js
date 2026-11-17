// TextDecoder uses the WHATWG encoding labels; the detector's aliases are
// normalized by TextDecoder before use. UTF-8 is always checked first.
export const ENCODINGS = [
  ["auto", "Auto-detect"],
  ["windows-1251", "Windows-1251 · Cyrillic"],
  ["koi8-r", "KOI8-R · Russian"],
  ["koi8-u", "KOI8-U · Ukrainian"],
  ["ibm866", "IBM866 · DOS Cyrillic"],
  ["iso-8859-5", "ISO-8859-5 · Cyrillic"],
  ["windows-1250", "Windows-1250 · Central European"],
  ["windows-1252", "Windows-1252 · Western European"],
  ["windows-1253", "Windows-1253 · Greek"],
  ["windows-1254", "Windows-1254 · Turkish"],
  ["windows-1255", "Windows-1255 · Hebrew"],
  ["windows-1256", "Windows-1256 · Arabic"],
  ["windows-1257", "Windows-1257 · Baltic"],
  ["windows-1258", "Windows-1258 · Vietnamese"],
  ["iso-8859-2", "ISO-8859-2 · Central European"],
  ["shift_jis", "Shift JIS · Japanese"],
  ["euc-jp", "EUC-JP · Japanese"],
  ["euc-kr", "EUC-KR · Korean"],
  ["gb18030", "GB18030 · Chinese"],
  ["big5", "Big5 · Traditional Chinese"],
  ["utf-16le", "UTF-16 LE"],
  ["utf-16be", "UTF-16 BE"],
];

export function validEncoding(value) {
  return ENCODINGS.some(([encoding]) => encoding === value);
}
