import {
  hostPattern,
  readRepositories,
  repositoryFromUrl,
} from "./shared/repositories.js";

const SCRIPT_PREFIX = "gitlab-cirillic-";
let pending = Promise.resolve();

async function registrationFor(repository) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(repository.key),
  );
  const id =
    SCRIPT_PREFIX +
    Array.from(new Uint8Array(hash), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  return {
    id,
    matches: [repository.key, `${repository.key}/-/*`],
    js: ["content.js"],
    runAt: "document_idle",
    persistAcrossSessions: true,
  };
}

async function synchronize() {
  const repositories = await readRepositories(browser.storage.local);
  const registrations = [];
  for (const key of Object.keys(repositories)) {
    const repository = repositoryFromUrl(key);
    if (
      await browser.permissions.contains({
        origins: [hostPattern(repository.origin)],
      })
    ) {
      registrations.push(await registrationFor(repository));
    }
  }
  const current = await browser.scripting.getRegisteredContentScripts();
  const desiredIds = new Set(registrations.map((item) => item.id));
  const obsolete = current.filter(
    (item) => item.id.startsWith(SCRIPT_PREFIX) && !desiredIds.has(item.id),
  );
  if (obsolete.length)
    await browser.scripting.unregisterContentScripts({
      ids: obsolete.map((item) => item.id),
    });
  const currentIds = new Set(current.map((item) => item.id));
  const added = registrations.filter((item) => !currentIds.has(item.id));
  if (added.length) await browser.scripting.registerContentScripts(added);
  // Existing installations retain registered scripts across browser restarts.
  // Upgrade their URL patterns as new source viewers are supported. Loading on
  // repository/tree pages also covers GitLab's client-side navigation to a file.
  const changed = registrations.filter((item) => {
    const previous = current.find((registered) => registered.id === item.id);
    return (
      previous &&
      JSON.stringify(previous.matches) !== JSON.stringify(item.matches)
    );
  });
  if (changed.length) await browser.scripting.updateContentScripts(changed);
}

function synchronizeQueued() {
  pending = pending.catch(() => {}).then(synchronize);
  return pending;
}

function synchronizeInBackground() {
  synchronizeQueued().catch((error) =>
    console.error("[GitLab Cirillic]", error.message),
  );
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (
    message?.type === "synchronize" &&
    sender.id === browser.runtime.id &&
    sender.url?.startsWith(browser.runtime.getURL(""))
  ) {
    return synchronizeQueued().then(() => ({ ok: true }));
  }
});
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.repositories) synchronizeInBackground();
});
browser.permissions.onRemoved.addListener(synchronizeInBackground);
browser.runtime.onInstalled.addListener(synchronizeInBackground);
browser.runtime.onStartup.addListener(synchronizeInBackground);
