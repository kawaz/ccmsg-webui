import type { AgentInfo, LastLiveSession, PeerInfo, SessionErrorEntry, Sid } from "@ccmsg/protocol";

/** What the session list is made of, out of the rows the contract delivers.
 *
 * Pure functions over the folded topics: the ordering a person picked, the
 * error attached to a row, and the label a row is shown under. */

export const SORT_KEYS = ["user_input", "activity", "connected", "cwd"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_LABELS: Record<SortKey, string> = {
  user_input: "人が話しかけた順",
  activity: "セッションが動いた順",
  connected: "接続した順",
  cwd: "作業ディレクトリ順",
};

export function isSortKey(value: string): value is SortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}

/** Newest first, and a row with no such instant after every row that has one.
 *
 * Absent is not "long ago": `last_user_input_at` is missing while nothing has
 * been found, and sorting it as zero would bury a session that a person may
 * simply not have spoken to yet. */
function byInstant(a: number | undefined, b: number | undefined): number {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return b - a;
}

export function sortPeers(peers: readonly PeerInfo[], key: SortKey): readonly PeerInfo[] {
  const rows = [...peers];
  rows.sort((a, b) => {
    switch (key) {
      case "user_input":
        return byInstant(a.last_user_input_at, b.last_user_input_at) || a.sid.localeCompare(b.sid);
      case "activity":
        return byInstant(a.last_activity_at, b.last_activity_at) || a.sid.localeCompare(b.sid);
      case "connected":
        return byInstant(a.connected_at, b.connected_at) || a.sid.localeCompare(b.sid);
      case "cwd":
        return a.cwd.localeCompare(b.cwd) || a.sid.localeCompare(b.sid);
    }
  });
  return rows;
}

/** Last seen first: what a person coming back looks for is the session they
 * were in, and that is the most recent one. */
export function sortLastLive(rows: readonly LastLiveSession[]): readonly LastLiveSession[] {
  return [...rows].sort((a, b) => b.last_seen_at - a.last_seen_at || a.sid.localeCompare(b.sid));
}

/** Newest first, with sessions the instance already lists as peers left out:
 * the same session in both lists would read as two. */
export function sortAgents(
  rows: readonly AgentInfo[],
  peers: readonly PeerInfo[],
): readonly AgentInfo[] {
  const known = new Set(peers.map((peer) => peer.sid));
  return rows
    .filter((row) => !known.has(row.sid))
    .sort((a, b) => b.started_at - a.started_at || a.sid.localeCompare(b.sid));
}

/** The terminal each session names, over the whole of the harness's rows.
 *
 * Read from the rows as they arrive rather than from the list the screen shows:
 * a session that is also a connected peer is dropped from that list so it is
 * not read as two, and it is exactly the session a person is most likely to
 * want the terminal of. A row that names no terminal is left out — absent and
 * empty both mean there is nothing to open.
 *
 * Later rows win over earlier ones, which matters only where two instances
 * report the same session: the value is the one this instance last heard. */
export function terminalIdsBySid(rows: readonly AgentInfo[]): ReadonlyMap<Sid, string> {
  const found = new Map<Sid, string>();
  for (const row of rows) {
    if (row.terminal_id !== undefined && row.terminal_id !== "") {
      found.set(row.sid, row.terminal_id);
    }
  }
  return found;
}

export function errorsBySid(
  errors: readonly SessionErrorEntry[],
): ReadonlyMap<Sid, SessionErrorEntry> {
  return new Map(errors.map((entry) => [entry.sid, entry]));
}

/** What to call a session in a list. The title it gave itself when it has one,
 * and otherwise where it is working — never the bare id, which says nothing a
 * person recognises. */
export function sessionLabel(row: {
  title?: string | undefined;
  repo?: string | undefined;
  ws?: string | undefined;
  cwd?: string | undefined;
  sid: Sid;
}): string {
  if (row.title !== undefined && row.title !== "") return row.title;
  if (row.repo !== undefined && row.repo !== "") {
    return row.ws === undefined || row.ws === "" ? row.repo : `${row.repo}/${row.ws}`;
  }
  if (row.cwd !== undefined && row.cwd !== "") return row.cwd;
  return row.sid;
}
