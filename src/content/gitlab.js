import { mergeRequestRepository } from "../shared/repositories.js";

export const FILE_SELECTOR = ".diff-file.file-holder";
const SHA = /^[a-f0-9]{40,64}$/i;

export function validFilePath(path) {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    path.length < 8192 &&
    !path.startsWith("/") &&
    !/[\x00-\x1f\\]/.test(path) &&
    !path.split("/").some((part) => part === "." || part === "..")
  );
}

/** Use refs from the displayed diff, including historical versions of an MR. */
export function sourceInfo(file, location) {
  const repository = mergeRequestRepository(location.href);
  if (!repository || !file || file.submodule || file.stored_externally)
    return null;
  const refs = file.diff_refs;
  if (!refs || !SHA.test(refs.head_sha || "") || !SHA.test(refs.base_sha || ""))
    return null;
  if (!validFilePath(file.new_path) || !validFilePath(file.old_path))
    return null;
  let sourceRoot = repository.path;
  // For fork MRs GitLab's blob link points at the repository that owns the refs.
  if (typeof file.view_path === "string") {
    try {
      const view = new URL(file.view_path, location.origin);
      const match = view.pathname.match(
        /^(\/.+?)\/-\/blob\/([a-f0-9]{40,64})\//i,
      );
      if (
        view.origin !== location.origin ||
        !match ||
        ![refs.head_sha, refs.base_sha].includes(match[2])
      )
        return null;
      sourceRoot = match[1];
    } catch {
      return null;
    }
  }
  const raw = (sha, path) =>
    `${sourceRoot}/-/raw/${sha}/${path.split("/").map(encodeURIComponent).join("/")}`;
  return {
    old: file.new_file ? null : raw(refs.base_sha, file.old_path),
    new: file.deleted_file ? null : raw(refs.head_sha, file.new_path),
    key: [
      sourceRoot,
      refs.base_sha,
      refs.head_sha,
      file.old_path,
      file.new_path,
    ].join("\n"),
  };
}

export function readFileInfo(element, location) {
  try {
    // Firefox exposes page objects through this wrapper. Read validated metadata
    // only: never call page functions or inject executable code into the page.
    const pageElement = element.wrappedJSObject || element;
    const file =
      pageElement.__vue__?.$props?.file ||
      pageElement.__vueParentComponent?.props?.file;
    return sourceInfo(file, location);
  } catch {
    return null;
  }
}

export function linePosition(cell) {
  const row = cell?.closest(".diff-grid-left, .diff-grid-right");
  const match = row?.id.match(/_([0-9]+)_([0-9]+)$/);
  if (!match) return null;
  const oldLine = Number(match[1]),
    newLine = Number(match[2]);
  const removed =
    cell.classList.contains("old") || row.dataset.interopType === "old";
  const added =
    cell.classList.contains("new") || row.dataset.interopType === "new";
  const parallelOld =
    cell.classList.contains("parallel") && cell.classList.contains("left-side");
  const useOld = removed || (!added && parallelOld) || !newLine;
  const number = useOld ? oldLine : newLine;
  return Number.isSafeInteger(number) && number > 0
    ? { side: useOld ? "old" : "new", number }
    : null;
}

export function readLines(element) {
  return [...element.querySelectorAll(".line_content:not(.empty-cell)")]
    .map((cell) => ({
      line: cell.querySelector(".line"),
      position: linePosition(cell),
    }))
    .filter((entry) => entry.line && entry.position);
}

export const diffView = {
  selector: FILE_SELECTOR,
  readInfo: readFileInfo,
  readLines,
  linePosition: (line) => linePosition(line.closest(".line_content")),
};
