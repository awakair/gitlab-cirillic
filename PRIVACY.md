# Privacy

GitLab Cirillic does not send source code, browsing history, settings, analytics
or diagnostic logs to the developer or any third party.

## Data used locally

- Repository URLs in the allowlist and their chosen encodings are saved in
  Firefox's local extension storage. They are not synced by this extension.
- In enabled repositories, the extension reads the currently displayed file or
  MR diff, file paths, commit IDs and blob IDs. It fetches raw file revisions from the **same GitLab
  origin**, using the browser's existing session. This makes ordinary read-only
  requests to the GitLab instance the user is already viewing.
- Source bytes and decoded text are held in the current tab's memory. They are
  not persisted to extension storage.
- The web console receives local status and error messages. Source text, file
  paths, authentication tokens and raw responses are not logged.

There are no analytics, advertising, remote scripts, external encoding services
or API tokens to configure. The extension never writes to GitLab or Git.

## Permissions

| Permission                      | Purpose                                                              |
| ------------------------------- | -------------------------------------------------------------------- |
| `activeTab`                     | Identify the repository in the active tab when the popup is opened   |
| `storage`                       | Save the repository allowlist and per-repository encodings locally   |
| `scripting`                     | Register/inject the repair script in enabled repositories            |
| Optional HTTP/HTTPS site access | Read file views, diffs and raw files on the selected GitLab instance |

HTTP and HTTPS wildcard patterns are **optional** declarations to support
self-hosted GitLab domains. Installation grants no persistent access to all
websites. Enabling a repository asks Firefox for its origin only. Script
registration and the runtime allowlist restrict processing to enabled projects.

Removing a repository disables processing and restores changed lines. Removing
the final repository for an origin also releases the corresponding persistent
host permission. Uninstalling clears extension settings; reload open GitLab tabs
to return any remaining page modifications to their original state.
