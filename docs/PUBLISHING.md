# Publishing on Firefox Add-ons

Nothing in this project uploads, signs or publishes automatically.

## Build and submit

1. Use Node.js 24.15+, npm and Python 3.
2. Run `npm ci --ignore-scripts`, then `npm run package`.
3. Sign in to the [Mozilla Add-ons Developer Hub](https://addons.mozilla.org/developers/).
4. Submit a new add-on for distribution **on this site**.
5. Upload `artifacts/gitlab-cirillic-1.1.0.zip` as the extension package.
6. Supply `artifacts/gitlab-cirillic-1.1.0-source.zip` when Mozilla requests source
   code. The build bundles modules using esbuild and is not minified.
7. Use `PRIVACY.md` for the privacy policy and the listing draft below.
8. Add your maintainer contact, public repository URL and any desired screenshots
   in the listing. They are intentionally not fabricated in this project.
9. Complete Mozilla's review/signing process. A local ZIP is not a signed release.

Keep the Gecko extension ID in `extension/manifest.json` stable after the first
submission. For subsequent releases update both package and manifest versions,
update the package lock with npm, run the checks and rebuild.

## Build instructions for reviewers

```sh
npm ci --ignore-scripts
npm run build
```

`dist/` is the exact extension directory. `npm run package` additionally runs
tests, formatting checks and `web-ext lint`, then creates deterministic ZIPs.
No credentials, private registry or private source repository is needed.
The source package includes original jschardet sources in `third_party/`.

## Reviewer notes

- Manifest V3, Firefox 140+, desktop.
- No remote code, telemetry or third-party requests at runtime.
- Optional host permissions allow arbitrary self-hosted GitLab installations.
  The user grants access to a chosen origin. A separate repository allowlist
  restricts registration and runtime processing to enabled projects.
- No GitLab writes or API token setup. Existing browser credentials are used
  only for same-origin GET requests to immutable raw file URLs.
- The content script reads GitLab Vue file metadata through Firefox's
  `wrappedJSObject`. It validates paths, origins, commit IDs and blob IDs, does not call
  page functions, and does not evaluate page-supplied code.
- Unrecognized GitLab markup is skipped. File views require SourceViewer blob metadata.

To exercise the extension, use an accessible GitLab test project with a
Windows-1251 file containing a Russian comment and an MR that edits the file.
The GitLab instance must reproduce the loss of non-UTF-8 characters; some
versions already display them correctly. Enable the repository from the popup,
choose Windows-1251 if needed, and open Changes or the ordinary file viewer.
The tests exercise synthetic file views, diffs and raw bytes without requiring
a GitLab account: `npm test`.

## Suggested listing

**Name:** GitLab Cirillic

**Summary:** Restore legacy-encoded text in GitLab files and diffs. Works only in
repositories you explicitly enable.

**Description:**

Russian comments missing from a GitLab file or merge request? GitLab Cirillic
restores missing text by reading the exact displayed file contents and decoding
them locally. It does not change your repository or file encoding.

- Enable individual repositories from the extension popup.
- Use GitLab.com or your own GitLab instance.
- Automatically detect common legacy encodings or choose one manually.
- Leave valid UTF-8, ASCII and already-readable lines unchanged.
- Keep all processing local. No analytics or third-party encoding services.

File views and merge request diffs with supported GitLab markup are handled. The extension
does not repair discussion messages or every form of garbled text. Checking an
encoding downloads the relevant raw file once per revision per page.

**Category suggestion:** Web Development.

**Data collection:** None. Review `PRIVACY.md`; ordinary requests to the user's
GitLab instance are described there. The manifest declares
`data_collection_permissions.required: ["none"]`.
