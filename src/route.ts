import type { Sid } from "@ccmsg/protocol";

/** The URL grammar, as far as this build reaches.
 *
 * `/` is the session list and `/s/<sid>/<tab>` is one session. The tab is part
 * of the path rather than of the page's own memory so that a link names the
 * whole of what the sender was looking at. */

export const TABS = ["timeline", "files", "status", "rooms"] as const;
export type Tab = (typeof TABS)[number];

export const DEFAULT_TAB: Tab = "timeline";

export type Route =
  | { readonly at: "sessions" }
  | { readonly at: "session"; readonly sid: Sid; readonly tab: Tab }
  | { readonly at: "unknown"; readonly path: string };

const SID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isTab(value: string): value is Tab {
  return (TABS as readonly string[]).includes(value);
}

export function parseRoute(path: string): Route {
  const parts = path.split("/").filter((part) => part !== "");
  if (parts.length === 0) return { at: "sessions" };
  const [head, sid, tab] = parts;
  if (head !== "s" || sid === undefined || !SID.test(sid)) return { at: "unknown", path };
  if (tab === undefined) return { at: "session", sid, tab: DEFAULT_TAB };
  if (!isTab(tab)) return { at: "unknown", path };
  return { at: "session", sid, tab };
}

export function routePath(route: Route): string {
  switch (route.at) {
    case "sessions":
      return "/";
    case "session":
      return `/s/${route.sid}/${route.tab}`;
    case "unknown":
      return route.path;
  }
}
