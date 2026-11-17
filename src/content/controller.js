import {
  readRepositories,
  sourcePageRepository,
  repositoryFromUrl,
} from "../shared/repositories.js";
import { validEncoding } from "../shared/encodings.js";
import { diffView } from "./gitlab.js";
import { blobView } from "./blob.js";
import { canRestore } from "./encoding.js";
import { SourceCache } from "./source-cache.js";

const VIEWS = [diffView, blobView];
const FILE_SELECTOR = VIEWS.map((view) => view.selector).join(", ");

export class PageController {
  constructor(window, api) {
    this.window = window;
    this.document = window.document;
    this.api = api;
    this.cache = new SourceCache(
      window.location.origin,
      window.fetch.bind(window),
    );
    this.originals = new Map();
    this.pendingFiles = new Set();
    this.logged = new Set();
    this.encoding = null;
    this.repositoryKey = null;
    this.pageUrl = null;
    this.generation = 0;
    this.settingsVersion = 0;
    this.running = false;
    this.timer = null;
    this.observer = new window.MutationObserver((records) =>
      this.onMutations(records),
    );
  }

  async start() {
    this.api.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.repositories)
        this.configure().catch((error) => this.warn("settings", error.message));
    });
    this.api.runtime.onMessage.addListener((message) => {
      if (message?.type === "status") return Promise.resolve(this.status());
      if (message?.type === "configure")
        return this.configure().then(() => this.status());
    });
    this.window.addEventListener("popstate", () =>
      this.configure().catch((error) => this.warn("navigation", error.message)),
    );
    this.window.addEventListener("pagehide", () => this.stop());
    this.window.addEventListener("pageshow", (event) => {
      if (!event.persisted) return;
      this.encoding = null;
      this.configure().catch((error) => this.warn("navigation", error.message));
    });
    await this.configure();
  }

  async configure() {
    const version = ++this.settingsVersion;
    const pageUrl = this.currentPageUrl();
    const repository = repositoryFromUrl(pageUrl);
    const repositories = await readRepositories(this.api.storage.local);
    if (version !== this.settingsVersion) return;
    const setting = repository && repositories[repository.key];
    const encoding =
      setting && validEncoding(setting.encoding) ? setting.encoding : null;
    if (
      this.encoding === encoding &&
      this.repositoryKey === repository?.key &&
      this.pageUrl === pageUrl
    )
      return;
    this.generation++;
    this.observer.disconnect();
    this.window.clearTimeout(this.timer);
    this.pendingFiles.clear();
    this.restore();
    this.encoding = encoding;
    this.repositoryKey = repository?.key;
    this.pageUrl = pageUrl;
    if (!encoding) {
      this.cache.abortPending();
      return;
    }
    this.observer.observe(this.document.body, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-path", "id"],
    });
    if (sourcePageRepository(pageUrl)) {
      for (const file of this.document.querySelectorAll(FILE_SELECTOR))
        this.pendingFiles.add(file);
    }
    this.schedule();
  }

  currentPageUrl() {
    return this.window.location.href.split("#")[0];
  }

  status() {
    this.pruneOriginals();
    return { enabled: Boolean(this.encoding), restored: this.originals.size };
  }

  warn(key, message) {
    if (this.logged.has(key)) return;
    this.logged.add(key);
    // Do not log source code, paths, tokens or raw responses.
    this.window.console.warn("[GitLab Cirillic]", message);
  }

  restore() {
    for (const [line, record] of this.originals) {
      if (line.isConnected && line.textContent === record.text)
        line.replaceChildren(...record.nodes);
    }
    this.originals.clear();
  }

  pruneOriginals() {
    for (const [line, record] of this.originals) {
      if (!line.isConnected || line.textContent !== record.text)
        this.originals.delete(line);
    }
  }

  onMutations(records) {
    if (!this.encoding) return;
    if (this.pageUrl !== this.currentPageUrl()) {
      this.configure().catch((error) => this.warn("navigation", error.message));
      return;
    }
    for (const record of records) {
      const target =
        record.target.nodeType === 1
          ? record.target
          : record.target.parentElement;
      const line = target?.closest(".line");
      if (
        record.type !== "attributes" &&
        line &&
        this.originals.get(line)?.text === line.textContent
      )
        continue;
      const file = target?.closest(FILE_SELECTOR);
      if (file) this.pendingFiles.add(file);
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches(FILE_SELECTOR)) this.pendingFiles.add(node);
        for (const added of node.querySelectorAll(FILE_SELECTOR))
          this.pendingFiles.add(added);
      }
    }
    if (this.pendingFiles.size) this.schedule();
  }

  schedule() {
    this.window.clearTimeout(this.timer);
    this.timer = this.window.setTimeout(
      () => this.scan().catch((error) => this.warn("scan", error.message)),
      100,
    );
  }

  async scan() {
    if (this.running || !this.encoding) return;
    // Guard against navigation while a request or debounced scan was pending.
    if (
      repositoryFromUrl(this.window.location.href)?.key !==
        this.repositoryKey ||
      this.pageUrl !== this.currentPageUrl()
    ) {
      await this.configure();
      return;
    }
    if (!sourcePageRepository(this.pageUrl)) return;
    this.running = true;
    const token = this.generation;
    const files = [...this.pendingFiles];
    this.pendingFiles.clear();
    let index = 0;
    let restored = 0;
    try {
      // Two files, at most four raw versions, may be requested concurrently.
      await Promise.all(
        [0, 1].map(async () => {
          while (
            index < files.length &&
            this.encoding &&
            token === this.generation
          ) {
            const file = files[index++];
            if (!file.isConnected) continue;
            try {
              restored += await this.processFile(file, token);
            } catch (error) {
              this.warn(`file:${error.message}`, error.message);
            }
          }
        }),
      );
      this.pruneOriginals();
      if (restored)
        this.window.console.info(
          "[GitLab Cirillic]",
          `Restored ${restored} line(s).`,
        );
    } finally {
      this.running = false;
      if (this.pendingFiles.size && this.encoding) this.schedule();
    }
  }

  async processFile(file, token) {
    const view = VIEWS.find((candidate) => file.matches(candidate.selector));
    if (!view) return 0;
    const entries = view.readLines(file);
    if (!entries.length) return 0;
    const info = view.readInfo(file, this.window.location);
    if (!info) {
      this.warn(
        "metadata",
        "Unsupported GitLab source metadata; files were left unchanged.",
      );
      return 0;
    }
    const sources = {};
    const encoding = this.encoding;
    await Promise.all(
      [...new Set(entries.map((entry) => entry.position.side))].map(
        async (side) => {
          try {
            sources[side] = await this.cache.get(info[side], encoding);
            if (["uncertain", "unsupported"].includes(sources[side]?.kind)) {
              this.warn(
                `encoding:${info[side]}:${encoding}`,
                "Encoding is ambiguous or unsupported. Select it in the extension popup.",
              );
            }
          } catch (error) {
            this.warn(`raw:${info[side]}`, error.message);
          }
        },
      ),
    );
    if (
      token !== this.generation ||
      !this.encoding ||
      !file.isConnected ||
      this.pageUrl !== this.currentPageUrl() ||
      sourcePageRepository(this.window.location.href)?.key !==
        this.repositoryKey ||
      view.readInfo(file, this.window.location)?.key !== info.key
    )
      return 0;
    let count = 0;
    for (const { line, position } of entries) {
      if (!line.isConnected || !file.contains(line)) continue;
      const current = view.linePosition(line);
      if (current?.side !== position.side || current.number !== position.number)
        continue;
      const key = `${info.key}:${position.side}:${position.number}`;
      const prior = this.originals.get(line);
      if (prior?.key === key && line.textContent === prior.text) continue;
      if (prior) {
        if (line.textContent === prior.text)
          line.replaceChildren(...prior.nodes);
        this.originals.delete(line);
      }
      const source = sources[position.side];
      const original =
        source?.kind === "legacy"
          ? source.lines[position.number - 1]
          : undefined;
      if (!canRestore(line.textContent, original)) continue;
      const nodes = [...line.childNodes];
      const replacement = this.document.createElement("span");
      if (/^\s*(\/\/|#|\*)/.test(original)) replacement.className = "c1";
      replacement.textContent = original;
      line.replaceChildren(replacement);
      this.originals.set(line, { nodes, text: original, key });
      count++;
    }
    return count;
  }

  stop() {
    this.generation++;
    this.observer.disconnect();
    this.window.clearTimeout(this.timer);
    this.pendingFiles.clear();
    this.cache.abortPending();
  }
}
