import { describe, expect, test } from "bun:test";
import type { AgentInfo, PeerInfo } from "@ccmsg/protocol";
import {
  answeringSids,
  groupPeers,
  isLost,
  sectionOf,
  sessionLabel,
  sortAgents,
  sortPeers,
  terminalIdsBySid,
  terminalOf,
  waitingForByPid,
} from "../src/sessions.ts";

const INSTANCE = "ws://a.example/ws";
const NOW = 1_000_000_000_000;

/** 走っている 1 プロセス。既定は「繋がっている run が 1 つ」で、そこから
 * 動かしたい所だけを test が書く。 */
function run(fields: Partial<PeerInfo["runs"][number]> = {}): PeerInfo["runs"][number] {
  return { pid: 100, started_at: NOW - 60_000, connected: true, ...fields };
}

function peer(sid: string, fields: Partial<PeerInfo> = {}): PeerInfo {
  return {
    sid,
    instance: INSTANCE,
    repo: "kawaz/ccmsg",
    ws: "main",
    cwd: `/w/${sid}`,
    protocol_version: 4,
    runs: [run()],
    session_status: "ready",
    ...fields,
  };
}

describe("the order a person picked", () => {
  test("newest first, and a row with no such instant after every row that has one", () => {
    const rows = [
      peer("00000000-0000-0000-0000-00000000000a", { last_user_input_at: 100 }),
      peer("00000000-0000-0000-0000-00000000000b"),
      peer("00000000-0000-0000-0000-00000000000c", { last_user_input_at: 300 }),
    ];
    expect(sortPeers(rows, "user_input").map((row) => row.sid.slice(-1))).toEqual(["c", "a", "b"]);
  });

  test("each key reads its own field", () => {
    const rows = [
      peer("00000000-0000-0000-0000-00000000000a", { last_activity_at: 1, connected_at: 9 }),
      peer("00000000-0000-0000-0000-00000000000b", { last_activity_at: 9, connected_at: 1 }),
    ];
    expect(sortPeers(rows, "activity").map((row) => row.sid.slice(-1))).toEqual(["b", "a"]);
    expect(sortPeers(rows, "connected").map((row) => row.sid.slice(-1))).toEqual(["a", "b"]);
  });

  test("ordering is stable on the id when the key ties", () => {
    const rows = [
      peer("00000000-0000-0000-0000-00000000000b"),
      peer("00000000-0000-0000-0000-00000000000a"),
    ];
    expect(sortPeers(rows, "user_input").map((row) => row.sid.slice(-1))).toEqual(["a", "b"]);
  });
});

describe("what belongs in which section", () => {
  const A = "00000000-0000-0000-0000-00000000000a";
  const B = "00000000-0000-0000-0000-00000000000b";
  const C = "00000000-0000-0000-0000-00000000000c";
  const D = "00000000-0000-0000-0000-00000000000d";

  test("how many processes, whether anything is out to answer, whether it is alive", () => {
    // 走っているが端末も接続も無い: 届かない。
    const adrift = peer(A, { runs: [{ connected: false }] });
    expect(sectionOf(adrift, false, NOW)).toBe("unreachable");
    expect(sectionOf(peer(B), false, NOW)).toBe("live");
    expect(sectionOf(peer(B), true, NOW)).toBe("waiting");
    expect(sectionOf(peer(C, { runs: [] }), false, NOW)).toBe("disappeared");
    expect(sectionOf(peer(C, { runs: [], stopped_at: NOW - 10 }), false, NOW)).toBe("paused");
  });

  test("two processes writing one session wins over everything else about it", () => {
    const twofold = peer(A, { runs: [run(), run({ pid: 200 })] });
    // 答え待ちであっても、先に決めるのはどちらを終わらせるか (契約 DR-0001 §3)。
    expect(sectionOf(twofold, true, NOW)).toBe("duplicated");
  });

  test("inference still running says a session with no process left is alive", () => {
    const busy = peer(A, { runs: [], gateway_active_at: NOW - 1_000 });
    expect(sectionOf(busy, false, NOW)).toBe("unreachable");
    const cold = peer(A, { runs: [], gateway_active_at: NOW - 60 * 60 * 1000 });
    expect(sectionOf(cold, false, NOW)).toBe("disappeared");
  });

  test("the sections stand in the order of the list, and an empty one is left out", () => {
    const rows = [
      peer(A, { runs: [] }),
      peer(B),
      peer(C, { runs: [run(), run({ pid: 200 })] }),
      peer(D),
    ];
    const groups = groupPeers(rows, new Set([B]), NOW);
    expect(groups.map((group) => group.section)).toEqual([
      "duplicated",
      "waiting",
      "live",
      "disappeared",
    ]);
    expect(groups[2]?.rows.map((row) => row.sid.slice(-1))).toEqual(["d"]);
  });

  test("only a row its instance has lost can be asked to be forgotten", () => {
    expect(isLost(peer(A, { runs: [], stopped_at: NOW - 10 }), NOW)).toBe(true);
    expect(isLost(peer(A, { runs: [] }), NOW)).toBe(true);
    expect(isLost(peer(A), NOW)).toBe(false);
    expect(isLost(peer(A, { runs: [run(), run({ pid: 200 })] }), NOW)).toBe(false);
  });
});

describe("the harness's own rows", () => {
  function agent(fields: Partial<AgentInfo> = {}): AgentInfo {
    return {
      instance: INSTANCE,
      pid: 1,
      cwd: "/w",
      kind: "interactive",
      started_at: 1,
      config_dir: "/c",
      ...fields,
    };
  }

  test("a row whose session the peer list already carries is not shown twice", () => {
    const sid = "00000000-0000-0000-0000-00000000000a";
    const row = agent({ sid });
    expect(sortAgents([row], [peer(sid)])).toEqual([]);
    expect(sortAgents([row], [])).toEqual([row]);
  });

  test("a process that has no session yet is always shown: nothing else would", () => {
    const starting = agent({ pid: 7, terminal_id: "hyoui:%3" });
    const sid = "00000000-0000-0000-0000-00000000000a";
    expect(sortAgents([starting, agent({ sid })], [peer(sid)])).toEqual([starting]);
  });

  test("newest first, and two processes of one session are two rows", () => {
    const sid = "00000000-0000-0000-0000-00000000000a";
    const older = agent({ sid, pid: 2, started_at: 10 });
    const newer = agent({ sid, pid: 3, started_at: 20 });
    expect(sortAgents([older, newer], []).map((row) => row.pid)).toEqual([3, 2]);
  });

  test("what is waiting on somebody, by session and by run", () => {
    const sid = "00000000-0000-0000-0000-00000000000a";
    const rows = [
      agent({ sid, pid: 2, waiting_for: "ファイルを書いてよいか" }),
      agent({ sid: "00000000-0000-0000-0000-00000000000b", pid: 3 }),
      // sid をまだ持たない run の待ちは、どのセッションのものとも言えない。
      agent({ pid: 4, waiting_for: "trust" }),
    ];
    expect([...answeringSids(rows)]).toEqual([sid]);
    expect(waitingForByPid(rows).get(2)).toBe("ファイルを書いてよいか");
    expect(waitingForByPid(rows).get(3)).toBeUndefined();
  });
});

describe("the terminal each session is opened through", () => {
  test("read from the runs on the session's own row", () => {
    const live = "00000000-0000-0000-0000-0000000000a1";
    const other = "00000000-0000-0000-0000-0000000000a2";
    const found = terminalIdsBySid([
      peer(live, { runs: [run({ terminal_id: "hyoui:%17" })] }),
      peer(other, { runs: [run({ terminal_id: "hyoui:%23" })] }),
    ]);
    expect(found.get(live)).toBe("hyoui:%17");
    expect(found.get(other)).toBe("hyoui:%23");
  });

  test("a session no run of which names a terminal is left out", () => {
    const none = "00000000-0000-0000-0000-0000000000b1";
    expect(terminalIdsBySid([peer(none, { runs: [run()] })]).has(none)).toBe(false);
    expect(terminalOf([])).toBeUndefined();
    expect(terminalOf([run(), run({ pid: 2, terminal_id: "hyoui:%9" })])).toBe("hyoui:%9");
  });
});

describe("what a row is called", () => {
  test("its own title, then where it is working, and the id only as a last resort", () => {
    const sid = "00000000-0000-0000-0000-00000000000a";
    expect(sessionLabel(peer(sid, { title: "並列化の検討" }))).toBe("並列化の検討");
    expect(sessionLabel(peer(sid))).toBe("kawaz/ccmsg/main");
    expect(sessionLabel({ sid, cwd: "/w/x" })).toBe("/w/x");
    expect(sessionLabel({ sid })).toBe(sid);
  });
});

describe("留めた行", () => {
  const rows: PeerInfo[] = [
    peer("1111", { last_user_input_at: 300 }),
    peer("2222", { last_user_input_at: 200 }),
    peer("3333", { last_user_input_at: 100 }),
  ];

  test("留めた行が先に来て、その中では選んだ並びのまま", () => {
    const said = sortPeers(rows, "user_input", new Set(["3333", "2222"]));
    expect(said.map((row) => row.sid)).toEqual(["2222", "3333", "1111"]);
  });

  test("留めていなければ、並びは選んだ通り", () => {
    expect(sortPeers(rows, "user_input").map((row) => row.sid)).toEqual(["1111", "2222", "3333"]);
  });
});
