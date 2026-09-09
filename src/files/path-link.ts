import type { Sid } from "@ccmsg/protocol";
import type { FilePathRef } from "../markdown/markdown-link.ts";
import type { Route } from "../route.ts";

/** The one shape this answers with: a place in the files tab. Narrower than
 * `Route` so a caller can read `path` off it without re-narrowing. */
export type FilesRoute = Extract<Route, { at: "session" }>;
import { displayPathFor } from "./paths.ts";

/** Where a file reference written in a session's text opens.
 *
 * The reference is a path as some author wrote it — in a message, in a
 * document — and the answer is a place in this app. Kept as one pure function
 * because the two screens that make such links (a transcript's messages, a
 * markdown file's own links) differ only in what a relative path is relative
 * to, and that difference is the argument.
 *
 * Nothing is invented when the session states no directory: an unresolvable
 * relative reference answers `undefined` and is left as plain text, which is
 * better than a link that lands on a plausible file in another worktree. */
export function filesRouteFor(
  sid: Sid,
  ref: FilePathRef,
  session: { readonly cwd?: string; readonly root?: string },
): FilesRoute | undefined {
  const path = displayPathFor(ref.path, session);
  if (path === undefined || path === "") return undefined;
  return {
    at: "session",
    sid,
    tab: "files",
    path,
    ...(ref.line === undefined
      ? {}
      : { lines: { start: ref.line, ...(ref.end === undefined ? {} : { end: ref.end }) } }),
  };
}
