import { build } from "esbuild";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(root, "dist");
await mkdir(dist, { recursive: true });
await cp(path.join(root, "extension"), dist, { recursive: true });
for (const file of ["popup.html", "popup.css"]) {
  await cp(path.join(root, "src/popup", file), path.join(dist, file));
}
await build({
  absWorkingDir: root,
  entryPoints: {
    content: "src/content/index.js",
    background: "src/background.js",
    popup: "src/popup/popup.js",
  },
  outdir: dist,
  bundle: true,
  format: "iife",
  target: "firefox140",
  minify: false,
  legalComments: "eof",
  charset: "utf8",
  logLevel: "info",
});
await cp(path.join(root, "LICENSE"), path.join(dist, "LICENSE"));
const dependencyLicense = await readFile(
  path.join(root, "node_modules/jschardet/LICENSE"),
  "utf8",
);
await writeFile(
  path.join(dist, "THIRD_PARTY_LICENSES.txt"),
  `jschardet\nhttps://github.com/aadsm/jschardet\n\n${dependencyLicense}`,
);
const vendorSource = path.join(root, "third_party/jschardet");
await mkdir(vendorSource, { recursive: true });
for (const file of [
  "LICENSE",
  "README.md",
  "package.json",
  "index.js",
  "src",
]) {
  await cp(
    path.join(root, "node_modules/jschardet", file),
    path.join(vendorSource, file),
    { recursive: true },
  );
}
