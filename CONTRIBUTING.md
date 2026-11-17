# Contributing

Run `npm ci --ignore-scripts`, then `npm run package` before proposing a change.
Use `npm run format` when the formatting check reports differences.

For a compatibility report, include Firefox and GitLab versions, inline or
side-by-side mode, the original encoding, and a small non-confidential sample.
Never include session cookies, access tokens, internal hostnames, proprietary
source code or raw responses in a public issue.

Keep GitLab-specific DOM and metadata changes inside `src/content/gitlab.js`
(diffs) and `src/content/blob.js` (file views).
Use immutable commit or blob IDs; never fall back to a moving branch name or the newest
MR revision. Add tests for both supported input and conditions that must leave
the diff untouched. Tests use synthetic fixtures, not private repositories.

Repository text must go through `textContent`. Do not execute page functions,
add remote scripts, send code to an encoding service, or expand access beyond
the user's allowlist. Keep UI on the extension popup; diagnostics belong in the
console.

If you discover a security issue, contact the maintainer privately through the
contact listed on the published Firefox Add-ons page rather than posting
sensitive details in a public issue.
