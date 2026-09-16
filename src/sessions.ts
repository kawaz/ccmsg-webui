import {
  liveness,
  reachable,
  waiting,
  type AgentInfo,
  type PeerInfo,
  type SessionErrorEntry,
  type SessionRun,
  type SessionStatusStanding,
  type Sid,
} from "@ccmsg/protocol";

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

/** 並び。**留めた行が先**で、その中では選ばれた並びのまま。
 *
 * 留めるのは「今これを追いかけている」という人の側の印なので、instance が言う
 * どの順よりも先に効く。 */
export function sortPeers(
  peers: readonly PeerInfo[],
  key: SortKey,
  pinned: ReadonlySet<string> = new Set(),
): readonly PeerInfo[] {
  const rows = [...peers];
  rows.sort((a, b) => {
    const held = Number(pinned.has(b.sid)) - Number(pinned.has(a.sid));
    if (held !== 0) return held;
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

/** The order the headings stand in: a session two processes are writing first,
 * then what is stopped at something a person has to answer, then what is
 * running, then what the instance has lost. Reading down the list is reading
 * from what needs a decision to what asks for nothing.
 *
 * The words are this screen's, out of what the contract answers about a row —
 * how many runs it has (`liveness`), whether anything here can act on one
 * (`reachable`), whether something is out to be answered (`waiting`). Nothing
 * on the wire says which heading a row goes under. */
export const SESSION_SECTIONS = [
  "duplicated",
  "waiting",
  "live",
  "unreachable",
  "paused",
  "disappeared",
] as const;
export type SessionSection = (typeof SESSION_SECTIONS)[number];

/** 見出しに出る語。**セクションの名前をそのまま出す** — 状態の名前は契約と
 * この画面が共有している語彙で、読み手が行の状態として目にするのも、issue や
 * 会話で呼ぶのも同じ綴りになる。訳すと、同じものが画面と会話で別名になる。
 * 行の側が持つ詳しさ (どこまで届かないのか等) は行に書いてあるので、見出しは
 * 1 語でよい。 */
export const SESSION_SECTION_LABELS: Readonly<Record<SessionSection, string>> = {
  duplicated: "Duplicated",
  waiting: "Waiting",
  live: "Live",
  unreachable: "Unreachable",
  paused: "Paused",
  disappeared: "Disappeared",
};

/** Which heading one row stands under.
 *
 * `duplicated` comes before everything else because it is the answer to another
 * question — how many processes — and a session two of them are writing is one
 * nothing else about is worth reading until a person picks one. `answering` is
 * what the `agents` row of this session says it is waiting on, which only the
 * person's own role ever sees. */
export function sectionOf(row: PeerInfo, answering: boolean, now: number): SessionSection {
  const stands = liveness(row, now);
  if (stands === "duplicated") return "duplicated";
  if (stands !== "alive") return stands;
  if (answering) return "waiting";
  return reachable(row) ? "live" : "unreachable";
}

/** Sessions the instance has lost, which is what a row can be forgotten from.
 * Asking an instance to forget a session it is holding would be asking it to
 * drop something it can still see. */
export function isLost(row: PeerInfo, now: number): boolean {
  const stands = liveness(row, now);
  return stands === "paused" || stands === "disappeared";
}

/** One heading of the list and the rows under it. */
export interface SessionGroup {
  readonly section: SessionSection;
  readonly rows: readonly PeerInfo[];
}

/** The list split by how its sessions stand, in the order above. An empty group
 * is left out: a heading over nothing says only that this build knows the
 * word. */
export function groupPeers(
  rows: readonly PeerInfo[],
  answering: ReadonlySet<Sid>,
  now: number,
): readonly SessionGroup[] {
  const under = new Map<SessionSection, PeerInfo[]>();
  for (const row of rows) {
    const section = sectionOf(row, answering.has(row.sid), now);
    const held = under.get(section);
    if (held === undefined) under.set(section, [row]);
    else held.push(row);
  }
  return SESSION_SECTIONS.flatMap((section) => {
    const held = under.get(section);
    return held === undefined ? [] : [{ section, rows: held }];
  });
}

/** The sessions with something out that a person has to answer.
 *
 * Read off the harness's own rows, which is where the dialog a session is
 * holding open is stated. The other material `waiting` takes — a turn that
 * ended on an upstream error — is in the status fold, and this build holds one
 * of those at a time (the session the URL names), so a list cannot read it. */
export function answeringSids(rows: readonly AgentInfo[]): ReadonlySet<Sid> {
  const found = new Set<Sid>();
  for (const row of rows) {
    if (row.sid !== undefined && waiting(row, undefined)) found.add(row.sid);
  }
  return found;
}

/** What one run says it is waiting on, out of the harness's rows. The rows are
 * matched by pid, which is what a run is. */
export function waitingForByPid(rows: readonly AgentInfo[]): ReadonlyMap<number, string> {
  const found = new Map<number, string>();
  for (const row of rows) {
    if (row.waiting_for !== undefined) found.set(row.pid, row.waiting_for);
  }
  return found;
}

/** The terminal a session is opened through, out of its own runs.
 *
 * The first run that names one: a session with one run has one answer, and a
 * session with two is one this screen sends a person to pick a run of before
 * anything is opened. */
export function terminalOf(runs: readonly SessionRun[]): string | undefined {
  return runs.find((run) => run.terminal_id !== undefined)?.terminal_id;
}

/** The terminal each session is opened through, over the rows as they arrive.
 *
 * Read from `peers` rather than from the harness's rows: a run states its own
 * terminal on the row of the session it runs, which is the row every screen
 * here already holds. */
export function terminalIdsBySid(rows: readonly PeerInfo[]): ReadonlyMap<Sid, string> {
  const found = new Map<Sid, string>();
  for (const row of rows) {
    const terminal = terminalOf(row.runs);
    if (terminal !== undefined) found.set(row.sid, terminal);
  }
  return found;
}

/** What the fold of a session's state is worth just now (contract,
 * `SessionStatusStanding`). `ready` says nothing a person needs told, so it has
 * no words here — the state itself is what they read. */
export const SESSION_STANDING_LABELS: Readonly<Record<SessionStatusStanding, string | undefined>> =
  {
    absent: "状態なし",
    folding: "読込中",
    ready: undefined,
    frozen: "凍結",
  };

/** The same, as a row in the list says it.
 *
 * `absent` is left off there: an instance folds a session's state when somebody
 * asks for it, so most rows in a list stand there, and a mark every row carries
 * says nothing about any of them. Where the fold is what is being read — the
 * state tab, a run's screen — it is said in full. */
export function listStanding(status: SessionStatusStanding): string | undefined {
  return status === "absent" ? undefined : SESSION_STANDING_LABELS[status];
}

/** Newest first: the harness's rows this list shows on their own.
 *
 * A row is one process. One whose session the peer list already carries is left
 * out — the same session in both lists would read as two — and one that names
 * no session yet is always here: it is a process a launcher started that the
 * harness has not named a session for, and nothing else in the app would show
 * it at all. */
export function sortAgents(
  rows: readonly AgentInfo[],
  peers: readonly PeerInfo[],
): readonly AgentInfo[] {
  const known = new Set(peers.map((peer) => peer.sid));
  return rows
    .filter((row) => row.sid === undefined || !known.has(row.sid))
    .sort((a, b) => b.started_at - a.started_at || a.pid - b.pid);
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
  /** Absent on a process a launcher started before the harness named a session
   * for it, which is a row that has a working directory and no id at all. */
  sid?: Sid | undefined;
}): string {
  if (row.title !== undefined && row.title !== "") return row.title;
  if (row.repo !== undefined && row.repo !== "") {
    return row.ws === undefined || row.ws === "" ? row.repo : `${row.repo}/${row.ws}`;
  }
  if (row.cwd !== undefined && row.cwd !== "") return row.cwd;
  return row.sid ?? "名前のない run";
}
