import type { Sid } from "@ccmsg/protocol";

/** The URL grammar, as far as this build reaches.
 *
 * `/` is the session list and `/s/<sid>/<tab>` is one session. The tab is part
 * of the path rather than of the page's own memory so that a link names the
 * whole of what the sender was looking at.
 *
 * `/s/<sid>.<pid>` is **one run** of that session rather than the session
 * (contract DR-0001): the process, what can be read of it, and ending it. The
 * pid hangs off the sid in the same segment because it qualifies which process
 * the session is being looked at through, and everything below the segment —
 * the tabs, the agents — is the session's and reads the same either way.
 *
 * `/s/<sid>/agent/<agentId>/timeline` is one agent below that session, read as
 * its own transcript. It hangs below the session because that is where the
 * agent hangs, and it ends in the tab it is because the timeline is the only
 * thing an agent has of its own.
 *
 * `/terminals` is the terminals of this host and `/terminal/<id>` is one of
 * them. They hang from the root rather than below a session because a terminal
 * is not a session's: the same terminal outlives the session that was running
 * in it, and a terminal a person opened for themselves was never any session's
 * to hang below (contract DR-0026).
 *
 * The files tab names two more things in the query: which file is open and
 * which lines are pointed at. They are the query rather than more path
 * segments because a path contains slashes — the one character a path segment
 * cannot carry — and because they qualify a tab rather than name a deeper
 * place.
 *
 * The grammar above is written from the base the build was published under
 * (`base`, `/` by default), which every function here takes rather than reads:
 * where a build lives is the build's own answer (`src/base.ts`), and the
 * grammar is the same one whether it hangs from `/` or from `/personal/`. */

export const TABS = ["timeline", "files", "terminal", "status"] as const;
export type Tab = (typeof TABS)[number];

export const DEFAULT_TAB: Tab = "timeline";

/** The tabs a session offers right now.
 *
 * Every other tab stands on something the instance always has; the terminal
 * stands on a gateway it may not front and on a terminal the session may not
 * name, and a tab that could only say "nothing here" is not offered at all.
 * The grammar still reads the path — a link made where the terminal was
 * reachable stays a valid URL where it is not, and lands on the tab saying so
 * rather than on a 404. */
export function visibleTabs(hasTerminal: boolean): readonly Tab[] {
  return hasTerminal ? TABS : TABS.filter((tab) => tab !== "terminal");
}

/** A stretch of a file, 1-based and inclusive. A single line is `end` absent. */
export interface LineRange {
  readonly start: number;
  readonly end?: number;
}

export type Route =
  | { readonly at: "sessions" }
  /** ホスト全体の話で、どのセッションのものでもない: gateway の上流と、
   * credential ごとのクオータ。 */
  | { readonly at: "usage" }
  /** この host にある端末ぜんぶ。セッションに属さないものも、まだセッションを
   * 名乗っていないハーネスのものも居る (契約 DR-0026)。 */
  | { readonly at: "terminals" }
  /** 色の見え方。instance に何も聞かないので、`/` の直下に居て、繋がって
   * いなくても立つ (DR-0001 §2.5)。 */
  | { readonly at: "settings" }
  /** 端末 1 つ。名前は `<scheme>:<handle>` で、scheme がどの端末管理の見た
   * ものかを言う。セッションの下ではなく `/` の直下に居る — 端末はセッション
   * の持ち物ではなく、セッションが終わっても残る。 */
  | { readonly at: "terminal"; readonly id: string }
  | {
      readonly at: "session";
      readonly sid: Sid;
      /** One run of it, where the address named one. What is then shown is the
       * run rather than the session (`src/runs.ts`). */
      readonly pid?: number;
      readonly tab: Tab;
      /** Which file the files tab shows: relative to the session's root, or
       * absolute for one reached outside it. */
      readonly path?: string;
      readonly lines?: LineRange;
    }
  /** One agent below a session, read as its own transcript. Only the timeline
   * is under here: the other tabs are the session's — its files, its terminal,
   * its state — and an agent has none of its own to show. */
  | { readonly at: "agent"; readonly sid: Sid; readonly agentId: string }
  | { readonly at: "unknown"; readonly path: string };

/** The session segment: the id, and after a dot the run being looked through.
 * A pid is what the OS hands out, so what is read is digits with no leading
 * zero rather than any particular width. */
const SESSION_SEGMENT =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.([1-9]\d*))?$/;

/** An agent id as a path segment. The harness coins it, so what is checked is
 * that it is one segment of URL-safe text rather than any particular shape. */
const AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/** A terminal id out of the segment carrying it, or nothing where the segment
 * names no terminal.
 *
 * The id is `<scheme>:<handle>` and the handle is the manager's own spelling —
 * `hyoui` names one `%17` — so the segment is percent-encoded whole and read
 * back the same way. What is checked is the shape the contract states and no
 * more: which schemes exist is the instance's answer, not the grammar's. */
function terminalId(segment: string): string | undefined {
  let id: string;
  try {
    id = decodeURIComponent(segment);
  } catch {
    return undefined;
  }
  const at = id.indexOf(":");
  return at <= 0 || at === id.length - 1 ? undefined : id;
}

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

/** A base as a prefix: one leading and one trailing slash, whatever it was
 * spelled as. */
export function normalizeBase(base: string): string {
  const withLead = base.startsWith("/") ? base : `/${base}`;
  return withLead.endsWith("/") ? withLead : `${withLead}/`;
}

/** The part of a pathname the grammar reads, or nothing when the address is
 * outside the base — which is a place this build does not answer for. */
function belowBase(path: string, base: string): string | undefined {
  const prefix = normalizeBase(base);
  if (prefix === "/") return path;
  if (`${path}/` === prefix) return "/";
  return path.startsWith(prefix) ? path.slice(prefix.length - 1) : undefined;
}

export function parseRoute(path: string, search = "", base = "/"): Route {
  const below = belowBase(path, base);
  if (below === undefined) return { at: "unknown", path };
  const parts = below.split("/").filter((part) => part !== "");
  if (parts.length === 0) return { at: "sessions" };
  if (parts.length === 1 && parts[0] === "usage") return { at: "usage" };
  if (parts.length === 1 && parts[0] === "terminals") return { at: "terminals" };
  if (parts.length === 1 && parts[0] === "settings") return { at: "settings" };
  if (parts.length === 2 && parts[0] === "terminal") {
    const id = terminalId(parts[1] as string);
    return id === undefined ? { at: "unknown", path } : { at: "terminal", id };
  }
  const [head, segment, tab] = parts;
  const named = segment === undefined ? null : SESSION_SEGMENT.exec(segment);
  if (head !== "s" || named === null) return { at: "unknown", path };
  const sid = named[1] as Sid;
  const run = named[2] === undefined ? {} : { pid: Number(named[2]) };
  if (tab === "agent") {
    const [, , , agentId, below] = parts;
    // An agent hangs below the session and not below a run of it: what it is
    // is a transcript, and a transcript belongs to the session.
    if (named[2] !== undefined) return { at: "unknown", path };
    if (agentId === undefined || !AGENT_ID.test(agentId)) return { at: "unknown", path };
    if (below !== DEFAULT_TAB || parts.length !== 5) return { at: "unknown", path };
    return { at: "agent", sid, agentId };
  }
  if (tab === undefined) return { at: "session", sid, ...run, tab: DEFAULT_TAB };
  if (!isTab(tab)) return { at: "unknown", path };
  if (tab !== "files") return { at: "session", sid, ...run, tab };
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const at = params.get("path");
  const lines = parseLineRange(params.get("lines"));
  return {
    at: "session",
    sid,
    ...run,
    tab,
    ...(at === null || at === "" ? {} : { path: at }),
    ...(lines === undefined ? {} : { lines }),
  };
}

export function routePath(route: Route, base = "/"): string {
  const prefix = normalizeBase(base);
  switch (route.at) {
    case "sessions":
      return prefix;
    case "usage":
      return `${prefix}usage`;
    case "terminals":
      return `${prefix}terminals`;
    case "settings":
      return `${prefix}settings`;
    case "terminal":
      return `${prefix}terminal/${encodeURIComponent(route.id)}`;
    case "session": {
      const named = route.pid === undefined ? route.sid : `${route.sid}.${String(route.pid)}`;
      const at = `${prefix}s/${named}/${route.tab}`;
      if (route.tab !== "files" || route.path === undefined) return at;
      const params = new URLSearchParams({ path: route.path });
      if (route.lines !== undefined) params.set("lines", formatLineRange(route.lines));
      return `${at}?${params.toString()}`;
    }
    case "agent":
      return `${prefix}s/${route.sid}/agent/${route.agentId}/${DEFAULT_TAB}`;
    case "unknown":
      // The address as it arrived, base and all: an unknown route is the whole
      // of what was asked for, not a place below this build.
      return route.path;
  }
}
