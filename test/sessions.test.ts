import { describe, expect, test } from "bun:test";
import type { AgentInfo, PeerInfo } from "@ccmsg/protocol";
import {
  sessionLabel,
  sortAgents,
  sortLastLive,
  sortPeers,
  terminalIdsBySid,
} from "../src/sessions.ts";

const INSTANCE = "ws://a.example/ws";

function peer(sid: string, fields: Partial<PeerInfo> = {}): PeerInfo {
  return {
    sid,
    instance: INSTANCE,
    repo: "kawaz/ccmsg",
    ws: "main",
    cwd: `/w/${sid}`,
    protocol_version: 2,
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
  test("last seen first, since that is the session a person is coming back to", () => {
    const rows = [
      { sid: "s1", instance: INSTANCE, repo: "", ws: "", cwd: "", last_seen_at: 10 },
      { sid: "s2", instance: INSTANCE, repo: "", ws: "", cwd: "", last_seen_at: 30 },
    ];
    expect(sortLastLive(rows).map((row) => row.sid)).toEqual(["s2", "s1"]);
  });

  test("an agent row the instance already lists as a peer is not shown twice", () => {
    const sid = "00000000-0000-0000-0000-00000000000a";
    const agent: AgentInfo = {
      sid,
      instance: INSTANCE,
      pid: 1,
      cwd: "/w",
      kind: "interactive",
      started_at: 1,
      config_dir: "/c",
    };
    expect(sortAgents([agent], [peer(sid)])).toEqual([]);
    expect(sortAgents([agent], [])).toEqual([agent]);
  });
});

describe("the terminal each session names", () => {
  function agent(sid: string, fields: Partial<AgentInfo> = {}): AgentInfo {
    return {
      sid,
      instance: INSTANCE,
      pid: 1,
      cwd: "/w",
      kind: "interactive",
      started_at: 1,
      config_dir: "/c",
      ...fields,
    };
  }

  test("read from every row, including one the peer list already carries", () => {
    const live = "00000000-0000-0000-0000-0000000000a1";
    const other = "00000000-0000-0000-0000-0000000000a2";
    const found = terminalIdsBySid([
      agent(live, { terminal_id: "run-1-aaa" }),
      agent(other, { terminal_id: "run-2-bbb" }),
    ]);
    expect(found.get(live)).toBe("run-1-aaa");
    expect(found.get(other)).toBe("run-2-bbb");
  });

  test("a row that names no terminal is left out", () => {
    const none = "00000000-0000-0000-0000-0000000000b1";
    const empty = "00000000-0000-0000-0000-0000000000b2";
    const found = terminalIdsBySid([agent(none), agent(empty, { terminal_id: "" })]);
    expect(found.has(none)).toBe(false);
    expect(found.has(empty)).toBe(false);
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
