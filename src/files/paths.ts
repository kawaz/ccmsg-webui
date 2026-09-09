import type { DirEntry } from "@ccmsg/protocol";

/** How a path is spelled decides which surface it is reached through.
 *
 * The contract gives `contained` paths relative to the session's root and
 * `workspace`/`external` paths absolute (contract `files.ts`), so a leading `/`
 * is the whole of the distinction and nothing else has to be carried alongside
 * a path to know what it is. That is also why the tree, the stored selection
 * and the URL all hold the same one string. */

/** The empty string is the contained root, which is why "" is a path here and
 * not a missing value. */
export const ROOT = "";

export function isAbsolutePath(path: string): boolean {
  return path.startsWith("/");
}

/** Collapse `.`, `..` and repeated separators. POSIX only: the paths here come
 * from a POSIX daemon and a Windows spelling would be a different question. */
export function normalizePath(path: string): string {
  const absolute = isAbsolutePath(path);
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      const last = out[out.length - 1];
      if (out.length > 0 && last !== "..") out.pop();
      else if (!absolute) out.push("..");
      continue;
    }
    out.push(part);
  }
  const joined = out.join("/");
  return absolute ? `/${joined}` : joined;
}

export function joinPath(dir: string, name: string): string {
  if (dir === ROOT) return name;
  if (dir === "/") return `/${name}`;
  return `${dir}/${name}`;
}

/** The directory holding `path`, or nothing when `path` is a root. */
export function parentPath(path: string): string | undefined {
  if (path === ROOT || path === "/") return undefined;
  const cut = path.lastIndexOf("/");
  if (cut < 0) return ROOT;
  if (cut === 0) return "/";
  return path.slice(0, cut);
}

/** Every directory between the root and `path`, outermost first. What a
 * selection needs opened to become visible. */
export function ancestorsOf(path: string): string[] {
  const out: string[] = [];
  for (let at = parentPath(path); at !== undefined; at = parentPath(at)) out.unshift(at);
  return out;
}

export function baseName(path: string): string {
  if (path === ROOT) return "";
  const cut = path.lastIndexOf("/");
  return cut < 0 ? path : path.slice(cut + 1);
}

/** Directories first, then everything else, each group by name.
 *
 * A symlink sorts by what it is called rather than by what it points at: the
 * instance answers a symlink as itself, and resolving it here to sort it would
 * be a second, different opinion about the same entry. */
export function sortEntries(entries: readonly DirEntry[]): DirEntry[] {
  return [...entries].sort((a, b) => {
    const rank = (entry: DirEntry) => (entry.type === "dir" ? 0 : 1);
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });
}

/** Whether `path` is `root` or lies under it. Both are absolute. */
export function withinRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(root.endsWith("/") ? root : `${root}/`);
}

/** Turn a path written in a transcript into the one this tab holds.
 *
 * A body's relative path is read against the session's working directory,
 * which is where the session itself would have read it. What lands inside the
 * browsable root becomes root-relative — the shape `contained` takes — and
 * everything else stays absolute, which is the shape the other two surfaces
 * take. Nothing is guessed when the session states no directory: an
 * unresolvable relative path is left unlinked rather than pointed at a
 * plausible file.
 *
 * `root` is the session's `repo_root` when it has one and its `cwd` otherwise,
 * matching what the daemon's containment resolves `contained` against. */
export function displayPathFor(
  path: string,
  session: { readonly cwd?: string; readonly root?: string },
): string | undefined {
  const absolute = isAbsolutePath(path)
    ? normalizePath(path)
    : session.cwd === undefined
      ? undefined
      : normalizePath(joinPath(session.cwd, path));
  if (absolute === undefined) return undefined;
  const root = session.root ?? session.cwd;
  if (root === undefined) return absolute;
  const canonicalRoot = normalizePath(root);
  if (!withinRoot(absolute, canonicalRoot)) return absolute;
  const cut = absolute.slice(canonicalRoot.length).replace(/^\//, "");
  return cut;
}

export type FileIconKind = "dir-open" | "dir-closed" | "symlink" | "markdown" | "code" | "file";

const CODE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "mts",
  "cts",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "jsonc",
  "css",
  "html",
  "htm",
  "sh",
  "bash",
  "zsh",
  "yml",
  "yaml",
  "toml",
  "py",
  "rs",
  "go",
  "diff",
  "patch",
]);

/** Which of the few glyphs stands for an entry. Deliberately coarse: an icon
 * per language is a table to maintain for a hint the file name already gives. */
export function fileIconKind(
  name: string,
  type: DirEntry["type"],
  expanded: boolean,
): FileIconKind {
  if (type === "dir") return expanded ? "dir-open" : "dir-closed";
  if (type === "symlink") return "symlink";
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return "file";
  const ext = name.slice(dot + 1).toLowerCase();
  if (ext === "md" || ext === "markdown") return "markdown";
  return CODE_EXTENSIONS.has(ext) ? "code" : "file";
}

export function isMarkdownPath(path: string): boolean {
  const name = baseName(path).toLowerCase();
  return name.endsWith(".md") || name.endsWith(".markdown");
}

/** Split content into the lines a viewer numbers.
 *
 * A trailing newline ends the last line rather than starting an empty one,
 * which is what an editor's line count says about the same file. */
export function splitLines(content: string): string[] {
  const lines = content.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}
