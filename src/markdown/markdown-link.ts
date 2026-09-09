// What the renderer is allowed to do with a link or image target.
//
// A body written by an agent routinely cites repository files as ordinary
// links: `[literal-child](fixtures/seq-parse/literal.json)` or
// `[spec](/docs/spec.md)`. Rendered naively those become `<a href>`s pointing at
// the **webui origin**, so clicking one navigates the app away to a URL that
// serves this site rather than the file the author meant. On a home-screen PWA
// there is no address bar and no back button, so that navigation is a dead end.
//
// So this module answers two questions with one policy: which URL schemes may
// reach an `href` at all, and which targets are files rather than destinations.
// Scheme policy and path policy are two answers to the same question, and
// splitting them across modules would let them drift.

/** A filesystem target named by a link, with the line range its fragment asked
 * for. What resolves such a reference to something openable belongs to the
 * viewer that shows files; here it is only recognised. */
export interface FilePathRef {
  readonly path: string;
  readonly line?: number;
  readonly end?: number;
}

// URL scheme allowlist for link/image targets: http/https/mailto, plus
// scheme-less URLs (relative paths, `#fragment`s) which CommonMark treats as
// valid link targets and carry no execution risk. Everything else
// (`javascript:`, `data:`, `vbscript:`, ...) is rejected — the caller must
// render the link's text without an `href` rather than trust the URL.
const ALLOWED_URL_SCHEMES = new Set(["http:", "https:", "mailto:"]);

/** The URL's scheme (lowercased, without the `:`), or `null` when it has none —
 * i.e. a relative path or a bare `#fragment`.
 *
 * Strips ASCII control characters (incl. space/tab/newline) before scanning,
 * matching how browsers' URL parsers skip them when determining a scheme. A
 * naive regex that didn't strip them first could be fooled by a scheme split
 * across a stripped character (e.g. `"java\tscript:alert(1)"`) into misreading
 * it as scheme-less (= trusted). A leading `//` (protocol-relative) reports a
 * synthetic scheme so it can never be mistaken for a relative path: it has no
 * explicit scheme to allowlist-check, but inherits the *page's* scheme at
 * render time, so it isn't "scheme-less" in the safe sense a relative path is. */
function urlScheme(url: string): string | null {
  // Intentional control-character match: stripping them is the scheme-split
  // evasion defense described above, not an accidental match.
  // oxlint-disable-next-line no-control-regex
  const stripped = url.replace(/[\u0000-\u0020]+/g, "");
  if (stripped.startsWith("//")) return "//";
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(stripped);
  return m ? m[1]!.toLowerCase() : null;
}

/** True if `url` is safe to place in an `href`/`src`. */
export function isSafeUrl(url: string): boolean {
  const scheme = urlScheme(url);
  if (scheme === null) return true; // relative path / fragment
  return ALLOWED_URL_SCHEMES.has(scheme + ":");
}

/** What the renderer should do with one link/image target.
 *
 *  - `disarm` — emit no `<a>` at all (hostile scheme, or a path-shaped target
 *    that cannot be turned into something openable). The link text is still
 *    shown; only the navigation is withheld.
 *  - `external` — a real off-app destination (http/https/mailto). Opens in a
 *    new tab.
 *  - `internal` — an absolute http(s) URL that happens to point back at this
 *    page's own origin (e.g. a session link pasted from the address bar). Only
 *    classified when the caller supplies `currentOrigin`; opens in the same tab
 *    like `path`/`anchor` rather than a fresh tab, since it names a place
 *    inside this same app. Deliberately narrower than `path`'s scheme-less
 *    relative-link handling — this only ever matches a full scheme'd URL.
 *  - `anchor` — `#fragment`, in-page navigation.
 *  - `path` — a target on the session's filesystem.
 */
export type MarkdownLinkTarget =
  | { kind: "disarm" }
  | { kind: "external"; url: string }
  | { kind: "internal"; url: string }
  | { kind: "anchor"; url: string }
  | { kind: "path"; ref: FilePathRef };

/** `#L10`, `#L10-L20`, `#L10-20` — the line-range fragment GitHub popularized
 * and the only fragment shape that means something about a file. Any other
 * fragment names a heading inside the *target* file, so it is dropped after
 * being used to split the path. */
const LINE_FRAGMENT_RE = /^L(\d+)(?:-L?(\d+))?$/;

/** Split a link URL into `{path, fragment}`. Only the first `#` counts — a
 * later one is part of the fragment, matching how a URL parser reads it. */
function splitFragment(url: string): { path: string; fragment: string } {
  const hash = url.indexOf("#");
  if (hash === -1) return { path: url, fragment: "" };
  return { path: url.slice(0, hash), fragment: url.slice(hash + 1) };
}

/** Parse a scheme-less link URL as a filesystem reference, or `null` when it
 * names nothing openable.
 *
 * A markdown link's syntax already declares intent — `[x](notes)` says "this is
 * a link to `notes`" outright — so no shape heuristic is applied and a bare
 * relative filename resolves the same as a nested one.
 *
 * A trailing `/` is refused: that is a directory, and what opens here are
 * files. Refusing it produces a dead (non-navigating) link, which is the
 * correct outcome — better than a click that resolves to nothing.
 *
 * A query string is stripped. `[x](foo.md?plain=1)` is a live GitHub idiom and
 * there is no server here to interpret a query, whereas a literal `?` inside a
 * filename — legal on POSIX but vanishingly rare — would merely lose its link.
 */
export function markdownLinkPathRef(url: string): FilePathRef | null {
  const { path: rawPath, fragment } = splitFragment(url);
  // Percent-encoding is how a path with spaces survives markdown link syntax
  // (`[x](my%20notes.md)`); malformed encoding falls back to the raw text
  // rather than throwing out of the render walk.
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    decoded = rawPath;
  }
  const query = decoded.indexOf("?");
  const path = query === -1 ? decoded : decoded.slice(0, query);
  if (path === "") return null;
  if (path.endsWith("/")) return null;
  const lines = LINE_FRAGMENT_RE.exec(fragment);
  if (!lines) return { path };
  const start = Number(lines[1]);
  if (start <= 0) return { path };
  const end = lines[2] !== undefined ? Number(lines[2]) : undefined;
  // An inverted range (`#L20-L10`) is more likely a typo than an intent, so
  // keep the anchor line and drop the range.
  if (end !== undefined && end >= start) return { path, line: start, end };
  return { path, line: start };
}

/** Decide what to do with one markdown link/image target.
 *
 * `currentOrigin` (typically `location.origin`, `undefined` in contexts — such
 * as unit tests — with no `location`) is used only to catch an *absolute*
 * http(s) URL that names this same page, so it opens in-app instead of a new
 * tab. It plays no role in the scheme-less relative-link path below. */
export function classifyMarkdownLinkUrl(
  url: string,
  currentOrigin?: string | null,
): MarkdownLinkTarget {
  const scheme = urlScheme(url);
  if (scheme !== null) {
    if (!ALLOWED_URL_SCHEMES.has(scheme + ":")) return { kind: "disarm" };
    if (currentOrigin && (scheme === "http" || scheme === "https")) {
      let urlOrigin: string | null = null;
      try {
        urlOrigin = new URL(url).origin;
      } catch {
        urlOrigin = null;
      }
      if (urlOrigin === currentOrigin) return { kind: "internal", url };
    }
    return { kind: "external", url };
  }
  if (url.startsWith("#")) return { kind: "anchor", url };
  const ref = markdownLinkPathRef(url);
  return ref ? { kind: "path", ref } : { kind: "disarm" };
}

/** Collect every link/image target in a markdown source, skipping fenced code
 * for the reason a link shown *as an example* is not a link the app should act
 * on.
 *
 * Deliberately more permissive than the mdast walk the renderer runs — a regex
 * over the source can only over-collect, never under-collect. Both paths funnel
 * through `markdownLinkPathRef`, so the *decision* about a URL is made in
 * exactly one place; only "is this text a link at all" differs. */
export function extractMarkdownLinkUrls(source: string): string[] {
  const urls: string[] = [];
  const fenceRe = /^ {0,3}(?:`{3,}|~{3,})/;
  // `[label](target)` / `![alt](target)`. The label may contain escaped
  // brackets. The target has two CommonMark forms, which differ in exactly the
  // way that matters here: `<...>` is the one that may contain spaces, so it
  // runs to the closing `>`, while the bare form must stop at the first
  // whitespace (what follows there is a link title, not part of the path).
  const linkRe = /!?\[(?:[^\]\\\n]|\\.)*\]\(\s*(?:<([^>\n]*)>|([^)\s]*))/g;
  let inFence = false;
  for (const line of source.split("\n")) {
    if (fenceRe.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    linkRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(line)) !== null) {
      const url = m[1] ?? m[2] ?? "";
      if (url !== "") urls.push(url);
    }
  }
  return urls;
}
