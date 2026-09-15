import {
  starting,
  terminalsOf,
  unattachedTerminals,
  type AgentInfo,
  type Sid,
  type TerminalInfo,
} from "@ccmsg/protocol";

/** What the terminal list is made of, out of the rows the contract delivers.
 *
 * A terminal is a row of its own and not a field of a session (contract
 * DR-0026): a person opens one with a shell in it, a harness starts in one
 * before it has said anything about itself, and the terminal outlives the
 * session that was running there. Which session is in which terminal is derived
 * — by the contract, from the pids — so nothing here matches them up; what is
 * here is the order the rows stand in and the words they are shown under. */

/** How a `terminals` row is matched: one terminal belongs to one host, so
 * `instance` and `id` together is what tells two hosts' rows apart under one
 * topic name. */
export function terminalRowKey(row: { instance: string; id: string }): string {
  return `${row.instance} ${row.id}`;
}

/** The handle a terminal's manager knows it by, without the scheme that says
 * which manager that is. What a person reads when the command says nothing. */
export function terminalHandle(id: string): string {
  const at = id.indexOf(":");
  return at < 0 ? id : id.slice(at + 1);
}

/** What to call a terminal: what is running in it. A manager that named no
 * command leaves the handle, which is the only other thing that tells this
 * terminal from the next one. */
export function terminalLabel(row: TerminalInfo): string {
  return row.command.length === 0 ? terminalHandle(row.id) : row.command.join(" ");
}

/** The order the headings stand in.
 *
 * `starting` first because it is the one a person comes here to find: a harness
 * was started and nothing has been heard from it, and the terminal is the only
 * place left to look. Then the terminals no session is in, and last the ones
 * that are a session's — those have a session's own screen to be read from, and
 * this list is where the others have none. */
export const TERMINAL_SECTIONS = ["starting", "unattached", "attached"] as const;
export type TerminalSection = (typeof TERMINAL_SECTIONS)[number];

export const TERMINAL_SECTION_LABELS: Readonly<Record<TerminalSection, string>> = {
  starting: "起動中のハーネス (状態ファイル待ち)",
  unattached: "セッションに属さない端末",
  attached: "セッションの端末",
};

export interface TerminalGroup {
  readonly section: TerminalSection;
  readonly rows: readonly TerminalInfo[];
}

/** Newest first, and a terminal whose manager stated no start after every one
 * that did — absent is not "long ago". The id breaks the tie, so two terminals
 * opened in the same millisecond stand in the same order every time. */
function byStart(a: TerminalInfo, b: TerminalInfo): number {
  if (a.started_at !== b.started_at) {
    if (a.started_at === undefined) return 1;
    if (b.started_at === undefined) return -1;
    return b.started_at - a.started_at;
  }
  return a.id.localeCompare(b.id);
}

/** The whole list, split by what each terminal is to the sessions around it.
 *
 * The split is the contract's two derivations and nothing of this build's own:
 * `starting` is the harnesses no run has been seen for, and
 * `unattachedTerminals` is every terminal no run is in — which is the wider of
 * the two, so what is left of it after the starting rows are taken out is the
 * terminals a person opened for themselves. An empty group is left out: a
 * heading over nothing says only that this build knows the word. */
export function groupTerminals(
  terminals: readonly TerminalInfo[],
  agents: readonly AgentInfo[],
): readonly TerminalGroup[] {
  const launching = new Set(starting(terminals, agents).map(terminalRowKey));
  const loose = new Set(unattachedTerminals(agents, terminals).map(terminalRowKey));
  const under = new Map<TerminalSection, TerminalInfo[]>();
  for (const row of terminals) {
    const key = terminalRowKey(row);
    const section: TerminalSection = launching.has(key)
      ? "starting"
      : loose.has(key)
        ? "unattached"
        : "attached";
    const held = under.get(section);
    if (held === undefined) under.set(section, [row]);
    else held.push(row);
  }
  return TERMINAL_SECTIONS.flatMap((section) => {
    const held = under.get(section);
    return held === undefined ? [] : [{ section, rows: [...held].sort(byStart) }];
  });
}

/** The harnesses that have started and not been heard from, newest first. What
 * the session list shows beside the sessions: there is no sid to show one
 * under, and the terminal is where a person looks when a session they started
 * has not appeared. */
export function startingTerminals(
  terminals: readonly TerminalInfo[],
  agents: readonly AgentInfo[],
): readonly TerminalInfo[] {
  return [...starting(terminals, agents)].sort(byStart);
}

/** The terminals one session is running in, newest first.
 *
 * `terminalsOf` reads the pids, which is what says which terminal a run is in;
 * `agents.terminal_id` is what an instance with no terminal manager knows
 * instead, and the caller falls back to it where this answers nothing (contract
 * DR-0026 §2). */
export function sessionTerminals(
  sid: Sid,
  terminals: readonly TerminalInfo[],
  agents: readonly AgentInfo[],
): readonly TerminalInfo[] {
  return [...terminalsOf(sid, agents, terminals)].sort(byStart);
}

/** One terminal by its id, over every instance's rows. The id carries the
 * scheme that says which manager observed it, so it is as much a name as a
 * person needs to type; two instances stating the same id is two managers
 * having coined the same handle, and the first row is as good an answer as the
 * second. */
export function terminalById(
  terminals: readonly TerminalInfo[],
  id: string,
): TerminalInfo | undefined {
  return terminals.find((row) => row.id === id);
}
