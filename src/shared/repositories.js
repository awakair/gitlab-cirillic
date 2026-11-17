export const STORAGE_KEY = "repositories";
export const DEFAULT_ENCODING = "auto";

/** A repository key includes the origin, nested groups and any GitLab URL prefix. */
export function repositoryFromUrl(value) {
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return null;
    const path = url.pathname
      .split("/-/")[0]
      .replace(/\/+$/, "")
      .replace(/\.git$/, "");
    if (!/^\/(?:[^/]+\/)+[^/]+$/.test(path) || /[\x00-\x20*]/.test(path))
      return null;
    return { key: url.origin + path, origin: url.origin, path };
  } catch {
    return null;
  }
}

export function mergeRequestRepository(value) {
  try {
    const url = new URL(value);
    if (!/\/-\/merge_requests\/\d+(?:\/|$)/.test(url.pathname)) return null;
    return repositoryFromUrl(url.href);
  } catch {
    return null;
  }
}

/** Pages with a supported source viewer; repository identity is shared by both. */
export function sourcePageRepository(value) {
  try {
    const url = new URL(value);
    if (!/\/-\/(?:merge_requests\/\d+(?:\/|$)|blob\/.+)/.test(url.pathname))
      return null;
    return repositoryFromUrl(url.href);
  } catch {
    return null;
  }
}

export function hostPattern(origin) {
  return `${origin}/*`;
}

export async function readRepositories(storage) {
  const result = await storage.get(STORAGE_KEY);
  const entries = result[STORAGE_KEY];
  if (!entries || typeof entries !== "object" || Array.isArray(entries))
    return {};
  return Object.fromEntries(
    Object.entries(entries).filter(([key, value]) => {
      const repository = repositoryFromUrl(key);
      return (
        repository?.key === key && value && typeof value.encoding === "string"
      );
    }),
  );
}
