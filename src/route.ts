import type { Sid } from "@ccmsg/protocol";

/** The URL grammar, as far as this build reaches.
 *
 * `/` is the session list and `/s/<sid>/<tab>` is one session. The tab is part
 * of the path rather than of the page's own memory so that a link names the
 * whole of what the sender was looking at.
 *
 * The files tab names two more things in the query: which file is open and
 * which lines are pointed at. They are the query rather than more path
 * segments because a path contains slashes — the one character a path segment
 * cannot carry — and because they qualify a tab rather than name a deeper
 * place. */

export const TABS = ["timeline", "files", "status", "rooms"] as const;
export type Tab = (typeof TABS)[number];

export const DEFAULT_TAB: Tab = "timeline";

/** A stretch of a file, 1-based and inclusive. A single line is `end` absent. */
export interface LineRange {
  readonly start: number;
  readonly end?: number;
}

export type Route =
  | { readonly at: "sessions" }
  | {
      readonly at: "session";
      readonly sid: Sid;
      readonly tab: Tab;
      /** Which file the files tab shows: relative to the session's root, or
       * absolute for one reached outside it. */
      readonly path?: string;
      readonly lines?: LineRange;
    }
  | { readonly at: "unknown"; readonly path: string };

const SID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isTab(value: string): value is Tab {
  return (TABS as readonly string[]).includes(value);
}

/** `12` or `12-20`. An inverted range keeps the anchor and drops the span: a
 * reversed pair is more likely a typo than a request. */
export function parseLineRange(value: string | null | undefined): LineRange | undefined {
  if (value === null || value === undefined) return undefined;
  const parts = /^(\d+)(?:-(\d+))?$/.exec(value);
  if (!parts) return undefined;
  const start = Number(parts[1]);
  if (start <= 0) return undefined;
  if (parts[2] === undefined) return { start };
  const end = Number(parts[2]);
  return end >= start ? { start, end } : { start };
}

export function formatLineRange(range: LineRange): string {
  return range.end === undefined || range.end === range.start
    ? String(range.start)
    : `${range.start}-${range.end}`;
}

export function parseRoute(path: string, search = ""): Route {
  const parts = path.split("/").filter((part) => part !== "");
  if (parts.length === 0) return { at: "sessions" };
  const [head, sid, tab] = parts;
  if (head !== "s" || sid === undefined || !SID.test(sid)) return { at: "unknown", path };
  if (tab === undefined) return { at: "session", sid, tab: DEFAULT_TAB };
  if (!isTab(tab)) return { at: "unknown", path };
  if (tab !== "files") return { at: "session", sid, tab };
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const at = params.get("path");
  const lines = parseLineRange(params.get("lines"));
  return {
    at: "session",
    sid,
    tab,
    ...(at === null || at === "" ? {} : { path: at }),
    ...(lines === undefined ? {} : { lines }),
  };
}

export function routePath(route: Route): string {
  switch (route.at) {
    case "sessions":
      return "/";
    case "session": {
      const base = `/s/${route.sid}/${route.tab}`;
      if (route.tab !== "files" || route.path === undefined) return base;
      const params = new URLSearchParams({ path: route.path });
      if (route.lines !== undefined) params.set("lines", formatLineRange(route.lines));
      return `${base}?${params.toString()}`;
    }
    case "unknown":
      return route.path;
  }
}
