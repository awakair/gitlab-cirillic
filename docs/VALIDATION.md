# Validation

## 1.1.0

Checked on 2026-11-17 with Node.js 24.22.1 and Firefox 160 on macOS.

- 50 automated tests passed, including ordinary file rendering, immutable blob
  requests, URL prefixes, chunked lines, tree-to-file navigation, stale responses,
  UTF-8 bypass and upgrading existing script registrations.
- `web-ext lint --warnings-as-errors`: zero errors, warnings or notices.
- The packaged ZIP was temporarily installed over version 1.0.0 in Firefox.
- A live GitLab file view restored 16 lines of Cyrillic from a legacy-encoded
  file. A separate UTF-8 source was checked and left unchanged.

## 1.0.0

Version 1.0.0 was checked on 2026-11-17 with Node.js 24.22.1 and Firefox 160 on
macOS.

- 36 automated tests passed: decoding, UTF-8 bypass, repository allowlisting,
  script registration, revision/path validation, inline and side-by-side row
  mapping, bounded downloads, request deduplication, lazy rows, safe text insertion,
  changing versions while requests are pending, and undoing repairs.
- `web-ext lint --warnings-as-errors`: zero errors, zero warnings, zero notices.
- Temporary installation of the packaged ZIP succeeded in Firefox.
- On a live self-hosted GitLab MR with Windows-1251 comments, enabling the
  repository and granting access to that origin restored Russian text.
- Removing that repository from the popup returned the original, damaged GitLab
  text. The test used the packaged Manifest V3 build and automatic detection.

Live verification covers that GitLab installation's markup; it does not imply
compatibility with every GitLab release. Other encodings are covered by synthetic
byte fixtures in the automated suite. No private source code or instance URLs
are included in this project.
