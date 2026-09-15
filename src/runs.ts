import type { SessionRun } from "@ccmsg/protocol";

/** What a URL naming a session — and, after a dot, one of its runs — asks for.
 *
 * A session and a run of it are two things (contract DR-0001), and the address
 * says which one is being looked at: `sid` is the session, `sid.pid` is one
 * process of it. The second is a narrower screen, because a session two
 * processes are writing has a frozen fold and nothing can be sent to it — what
 * is left to do there is read the material and end one of them. */
export type RunStanding =
  /** The session itself, with at most one process running it. */
  | { readonly at: "session" }
  /** Two or more runs and none named: a person picks which one they mean. */
  | { readonly at: "choose" }
  /** One named run of a session that has more than one. */
  | { readonly at: "run"; readonly run: SessionRun }
  /** A run named on a session that has only this one. Nothing here is
   * restricted any more, so the screen says so and points at the session. */
  | { readonly at: "single"; readonly run: SessionRun; readonly pid: number }
  /** A pid this session has no run for: it ended, or it never was one. The pid
   * travels so the screen can name what is gone. */
  | { readonly at: "ended"; readonly pid: number };

/** Which of those an address asks for.
 *
 * Whether the pid is one of the session's runs is asked before how many runs
 * there are. A link to a run that has since ended, on a session that has one
 * run left, otherwise reads as "this session only has one run" — which hides
 * the thing the person came back to find out. */
export function runStanding(runs: readonly SessionRun[], pid: number | undefined): RunStanding {
  if (pid === undefined) return runs.length >= 2 ? { at: "choose" } : { at: "session" };
  const named = runs.find((run) => run.pid === pid);
  if (named === undefined) return { at: "ended", pid };
  return runs.length === 1 ? { at: "single", run: named, pid } : { at: "run", run: named };
}
