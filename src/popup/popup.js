import { ENCODINGS, validEncoding } from "../shared/encodings.js";
import {
  hostPattern,
  readRepositories,
  repositoryFromUrl,
  STORAGE_KEY,
} from "../shared/repositories.js";

const toggle = document.querySelector("#toggle");
const encoding = document.querySelector("#encoding");
const status = document.querySelector("#status");
let tab;
let current;
let repositories = {};

function showStatus(text, error = false) {
  status.textContent = text;
  status.classList.toggle("error", error);
}

async function synchronize() {
  await browser.runtime.sendMessage({ type: "synchronize" });
  render();
}

async function removeRepository(key) {
  const latest = await readRepositories(browser.storage.local);
  delete latest[key];
  await browser.storage.local.set({ [STORAGE_KEY]: latest });
  repositories = latest;
  await synchronize();
  const removed = repositoryFromUrl(key);
  // Let open content scripts undo their changes before revoking host access.
  const tabs = await browser.tabs.query({ url: hostPattern(removed.origin) });
  await Promise.all(
    tabs.map((openTab) =>
      browser.tabs
        .sendMessage(openTab.id, { type: "configure" })
        .catch(() => {}),
    ),
  );
  if (
    !Object.keys(latest).some(
      (value) => repositoryFromUrl(value)?.origin === removed.origin,
    )
  ) {
    await browser.permissions.remove({
      origins: [hostPattern(removed.origin)],
    });
  }
  showStatus("Repository disabled. Original display restored.");
}

function render() {
  const enabled = Boolean(current && repositories[current.key]);
  toggle.disabled = !current;
  toggle.textContent = enabled
    ? "Disable for this repository"
    : "Enable for this repository";
  encoding.disabled = !enabled;
  encoding.value = enabled ? repositories[current.key].encoding : "auto";
  const list = document.querySelector("#repositories");
  list.replaceChildren();
  for (const key of Object.keys(repositories).sort()) {
    const row = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = key;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Remove";
    button.setAttribute("aria-label", `Remove ${key}`);
    button.addEventListener("click", () => {
      button.disabled = true;
      removeRepository(key).catch((error) => {
        showStatus(error.message, true);
        render();
      });
    });
    row.append(label, button);
    list.append(row);
  }
  document.querySelector("#empty").hidden =
    Object.keys(repositories).length > 0;
}

toggle.addEventListener("click", async () => {
  if (!current) return;
  toggle.disabled = true;
  try {
    if (repositories[current.key]) {
      await removeRepository(current.key);
      return;
    }
    // Keep this request directly in the click handler to preserve user activation.
    const granted = await browser.permissions.request({
      origins: [hostPattern(current.origin)],
    });
    if (!granted) {
      showStatus("Site access was not granted.");
      return;
    }
    repositories = await readRepositories(browser.storage.local);
    repositories[current.key] = { encoding: "auto" };
    await browser.storage.local.set({ [STORAGE_KEY]: repositories });
    await synchronize();
    // Registration handles future pages. Inject once into the already-open tab.
    await browser.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    showStatus("Enabled for file views and merge request diffs.");
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    render();
  }
});

encoding.addEventListener("change", async () => {
  if (!current || !validEncoding(encoding.value)) return;
  try {
    repositories = await readRepositories(browser.storage.local);
    if (!repositories[current.key]) return;
    repositories[current.key] = { encoding: encoding.value };
    await browser.storage.local.set({ [STORAGE_KEY]: repositories });
    showStatus("Encoding saved. The open page is being checked again.");
  } catch (error) {
    showStatus(error.message, true);
  }
});

async function initialize() {
  for (const [value, label] of ENCODINGS)
    encoding.add(new Option(label, value));
  [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  current = repositoryFromUrl(tab?.url);
  if (current) document.querySelector("#repository").textContent = current.key;
  repositories = await readRepositories(browser.storage.local);
  render();
  try {
    const result = await browser.tabs.sendMessage(tab.id, { type: "status" });
    if (result?.enabled) showStatus(`Restored lines: ${result.restored}`);
  } catch {
    /* No content script is expected outside enabled repositories. */
  }
}

initialize().catch((error) => showStatus(error.message, true));
