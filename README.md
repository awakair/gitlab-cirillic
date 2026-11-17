# GitLab Cirillic

## Problem

GitLab can lose characters when displaying files stored in encodings such as
Windows-1251 or KOI8-R. Russian comments may appear as empty spaces in the file
viewer or a merge request diff even though the original file still contains them.

Changing the browser's page encoding cannot recover text already discarded by
GitLab. Converting repository files to UTF-8 is not always an option.

## Solution

GitLab Cirillic is a Firefox extension that restores missing text in file views
and merge request diffs using the original contents. It changes only the browser
view; files and their encoding in Git remain unchanged.

Enable a repository from the extension popup to add it to the allowlist. The
extension works with GitLab.com and self-hosted instances, automatically detects
common legacy encodings, and offers a manual encoding choice for each repository.
Valid UTF-8, ASCII and already-readable lines are left unchanged.

## How it works

1. Identify the displayed content from GitLab's metadata. Diffs use commit IDs
   and old/new line numbers; ordinary file views use the file's immutable blob
   ID and line numbers. Moving branches never determine which bytes to restore.
2. Fetch the corresponding Raw files from the same GitLab instance using the
   existing browser session. Each revision is downloaded once per loaded page;
   subsequent checks reuse an in-memory cache.
3. Validate the bytes as UTF-8 first. If validation fails, use the selected
   encoding or detect it locally with jschardet, then decode with `TextDecoder`.
   Uncertain or unsupported results are skipped.
4. Match decoded lines to the page and restore missing characters only when the
   surviving ASCII text matches exactly. Insert the result as text, never HTML.

Newly loaded lines and navigation between files are handled automatically.
Disabling a repository restores its original display. Other repositories make
no requests, and no source code is sent to third-party services.

The extension depends on GitLab's source-viewer markup and Vue metadata. If those
cannot be read, it leaves the file untouched.
