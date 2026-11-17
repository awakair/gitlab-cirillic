# Changelog

## 1.1.0

- Restore missing text in ordinary GitLab file views as well as MR diffs.
- Fetch the displayed file by its immutable blob ID, independent of moving refs.
- Handle chunked file rendering and client-side navigation from the file tree.
- Upgrade existing content-script registrations without resetting the allowlist.

## 1.0.0

- Repository allowlist, optional permissions for each GitLab origin and
  per-repository encoding selection.
- Strict UTF-8 bypass, automatic legacy charset detection and manual overrides.
- Immutable raw revision downloads with bounded, page-local caching.
- Conservative diff restoration, lazy row support and reversible changes.
- Firefox Manifest V3, tests, reproducible packaging and publication documents.
