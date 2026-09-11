import type { AgentInfo, PeerInfo, SessionErrorEntry, SessionState, Sid } from "@ccmsg/protocol";

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

/** The order the groups stand in: what is stopped at something a person has to
 * answer first, then what is running, then what the instance has lost. Reading
 * down the list is then reading from what wants attention to what no longer
 * asks for any. */
export const SESSION_STATES: readonly SessionState[] = [
  "waiting",
  "live",
  "live_unmanaged",
  "paused",
  "disappeared",
];

export const SESSION_STATE_LABELS: Readonly<Record<SessionState, string>> = {
  waiting: "答え待ち",
  live: "稼働中",
  live_unmanaged: "稼働中 (届かない)",
  paused: "終了",
  disappeared: "消失",
};

/** Sessions the instance has lost, which is what a row can be forgotten from.
 * Asking an instance to forget a session it is holding would be asking it to
 * drop something it can still see. */
export function isLost(state: SessionState | undefined): boolean {
  return state === "paused" || state === "disappeared";
}

/** One heading of the list and the rows under it. A group with no state is the
 * rows an instance stated no classification for: the contract says such a
 * session is shown without being grouped rather than guessed at, and it stands
 * first so that the rows nothing can be said about are not buried. */
export interface SessionGroup {
  readonly state?: SessionState;
  readonly rows: readonly PeerInfo[];
}

/** The list split by how its sessions stand, in the order above.
 *
 * Grouping is on `state` alone — the instance holding a session states the
 * classification rather than the inputs it read, so every client shows the same
 * session the same way. An empty group is left out: a heading over nothing says
 * only that this build knows the word. */
export function groupPeers(rows: readonly PeerInfo[]): readonly SessionGroup[] {
  const ungrouped = rows.filter((row) => row.state === undefined);
  const groups: SessionGroup[] = ungrouped.length === 0 ? [] : [{ rows: ungrouped }];
  for (const state of SESSION_STATES) {
    const under = rows.filter((row) => row.state === state);
    if (under.length > 0) groups.push({ state, rows: under });
  }
  return groups;
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
