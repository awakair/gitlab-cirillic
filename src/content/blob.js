import { sourcePageRepository } from "../shared/repositories.js";
import { validFilePath } from "./gitlab.js";

const SELECTOR = ".file-content.blob-content";
const BLOB_ID = /^gid:\/\/gitlab\/Blob\/([a-f0-9]{40,64})$/i;
const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");

/** The blob ID identifies file bytes, independent of a moving branch or tag. */
export function blobSourceInfo(blob, projectPath, location) {
  const repository = sourcePageRepository(location.href);
  if (
    !repository ||
    !location.pathname.startsWith(`${repository.path}/-/blob/`)
  )
    return null;
  if (
    !blob ||
    blob.binary ||
    blob.storedExternally ||
    !validFilePath(blob.path) ||
    !validFilePath(projectPath)
  )
    return null;
  const id = typeof blob.id === "string" && blob.id.match(BLOB_ID)?.[1];
  if (!id) return null;
  try {
    const view = new URL(blob.webPath, location.origin);
    if (
      view.origin !== location.origin ||
      view.pathname !== location.pathname ||
      !view.pathname.endsWith(`/${encodePath(blob.path)}`)
    )
      return null;
  } catch {
    return null;
  }

  // Support GitLab installations mounted below a URL prefix, e.g. /gitlab.
  const projectSuffix = `/${encodePath(projectPath)}`;
  if (!repository.path.endsWith(projectSuffix)) return null;
  const prefix = repository.path.slice(0, -projectSuffix.length);
  const raw = `${prefix}/api/v4/projects/${encodeURIComponent(projectPath)}/repository/blobs/${id}/raw`;
  return { new: raw, old: null, key: `${location.pathname}\n${raw}` };
}

export function readBlobInfo(element, location) {
  try {
    // SourceViewer owns the displayed RepositoryBlob. Ancestor lookup supports
    // the chunked viewer without relying on branch names or making API guesses.
    let ancestor = element;
    for (
      let depth = 0;
      ancestor && depth < 7;
      depth++, ancestor = ancestor.parentElement
    ) {
      const pageElement = ancestor.wrappedJSObject || ancestor;
      const props =
        pageElement.__vue__?.$props || pageElement.__vueParentComponent?.props;
      if (!props?.blob) continue;
      if (element.dataset.path && element.dataset.path !== props.blob.path)
        return null;
      return blobSourceInfo(props.blob, props.projectPath, location);
    }
  } catch {
    /* Unrecognized page metadata is left untouched. */
  }
  return null;
}

export function blobLinePosition(line) {
  const match = line?.id.match(/^LC([1-9][0-9]*)$/);
  const number = match ? Number(match[1]) : 0;
  return Number.isSafeInteger(number) && number > 0
    ? { side: "new", number }
    : null;
}

export const blobView = {
  selector: SELECTOR,
  readInfo: readBlobInfo,
  readLines(element) {
    return [...element.querySelectorAll("code .line[id]")]
      .map((line) => ({ line, position: blobLinePosition(line) }))
      .filter((entry) => entry.position);
  },
  linePosition: blobLinePosition,
};
