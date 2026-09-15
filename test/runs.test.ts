import { describe, expect, test } from "bun:test";
import type { SessionRun } from "@ccmsg/protocol";
import { runStanding } from "../src/runs.ts";

function run(pid: number): SessionRun {
  return { pid, started_at: 1, connected: true };
}

describe("what an address naming a run asks for", () => {
  test("no run named: the session, or a choice where two are running it", () => {
    expect(runStanding([], undefined)).toEqual({ at: "session" });
    expect(runStanding([run(1)], undefined)).toEqual({ at: "session" });
    expect(runStanding([run(1), run(2)], undefined)).toEqual({ at: "choose" });
  });

  test("a named run of a session two processes are writing is the restricted screen", () => {
    expect(runStanding([run(1), run(2)], 2)).toEqual({ at: "run", run: run(2) });
  });

  test("a run named on a session that has only this one is no longer restricted", () => {
    expect(runStanding([run(1)], 1)).toEqual({ at: "single", run: run(1), pid: 1 });
  });

  test("a pid the session has no run for ended, whatever else is running", () => {
    // 1 つに戻った後で古いリンクを開いた時、「run は 1 つです」と言うと、その
    // 人が確かめに来たこと (自分の run がどうなったか) が消える。
    expect(runStanding([run(1)], 9)).toEqual({ at: "ended", pid: 9 });
    expect(runStanding([], 9)).toEqual({ at: "ended", pid: 9 });
    expect(runStanding([run(1), run(2)], 9)).toEqual({ at: "ended", pid: 9 });
  });
});
