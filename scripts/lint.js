import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(
  await readFile(path.join(root, "dist/manifest.json"), "utf8"),
);
const result = spawnSync(
  process.execPath,
  [
    path.join(root, "node_modules/web-ext/bin/web-ext.js"),
    "lint",
    "--source-dir",
    path.join(root, "dist"),
    "--output",
    "json",
  ],
  { cwd: root, encoding: "utf8" },
);
if (result.error) throw result.error;
if (result.stderr) process.stderr.write(result.stderr);
const report = JSON.parse(result.stdout);

// web-ext checks Android even when the AMO release only targets desktop.
// Keep every other warning fatal, including this one if Android is enabled.
const warnings = report.warnings.filter((warning) => {
  const desktopOnlyWarning =
    !manifest.browser_specific_settings?.gecko_android &&
    warning.code === "KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION" &&
    warning.file === "manifest.json" &&
    warning.description.includes(
      '"browser_specific_settings.gecko.data_collection_permissions"',
    );
  if (desktopOnlyWarning) {
    console.log(`Skipped for desktop-only distribution: ${warning.code}`);
  }
  return !desktopOnlyWarning;
});

for (const issue of [...report.errors, ...warnings, ...report.notices]) {
  console.log(`${issue.code}: ${issue.message}\n${issue.description}`);
}
console.log(
  `web-ext: ${report.errors.length} errors, ${warnings.length} applicable warnings, ${report.notices.length} notices`,
);
if (result.status !== 0 || report.errors.length || warnings.length) {
  process.exitCode = 1;
}
