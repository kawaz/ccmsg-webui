import { describe, expect, test } from "bun:test";
import type { AgentInfo, Sid, TerminalInfo } from "@ccmsg/protocol";
import {
  groupTerminals,
  sessionTerminals,
  startingTerminals,
  terminalById,
  terminalHandle,
  terminalLabel,
  terminalRowKey,
} from "../src/terminals.ts";

const INSTANCE = "00112233445566778899aabbccddeeff";
const OTHER = "ffeeddccbbaa99887766554433221100";
const NOW = 1_000_000_000_000;
const SID = "11111111-2222-4333-8444-555555555555" as Sid;

function terminal(id: string, fields: Partial<TerminalInfo> = {}): TerminalInfo {
  return {
    instance: INSTANCE,
    id,
    state: "running",
    command: ["zsh", "-i"],
    cwd: "/repo",
    started_at: NOW,
    ...fields,
  };
}

function agent(pid: number, fields: Partial<AgentInfo> = {}): AgentInfo {
  return {
    instance: INSTANCE,
    pid,
    kind: "interactive",
    started_at: NOW - 60_000,
    cwd: "/repo",
    config_dir: "/home/.claude",
    ...fields,
  };
}

describe("端末の一覧", () => {
  test("行の鍵は instance と id の両方 (端末は host のもの)", () => {
    expect(terminalRowKey(terminal("hyoui:%17"))).not.toBe(
      terminalRowKey(terminal("hyoui:%17", { instance: OTHER })),
    );
  });

  test("名前は走っているコマンド。何も言われなければ handle", () => {
    expect(terminalLabel(terminal("hyoui:%17", { command: ["claude", "--continue"] }))).toBe(
      "claude --continue",
    );
    expect(terminalLabel(terminal("hyoui:%31", { command: [] }))).toBe("%31");
    expect(terminalHandle("hyoui:%31")).toBe("%31");
  });

  test("セッションの端末・人の端末・起動中が、この順に分かれる", () => {
    const rows = [
      terminal("hyoui:%17", { command: ["claude", "--continue"], pid: 4821 }),
      terminal("hyoui:%31", { pid: 5177 }),
      terminal("hyoui:%42", { command: ["claude"], pid: 6033 }),
    ];
    const groups = groupTerminals(rows, [agent(4821, { sid: SID })]);
    expect(groups.map((group) => [group.section, group.rows.map((row) => row.id)])).toEqual([
      ["starting", ["hyoui:%42"]],
      ["unattached", ["hyoui:%31"]],
      ["attached", ["hyoui:%17"]],
    ]);
  });

  test("空の見出しは立たない", () => {
    expect(groupTerminals([], [])).toEqual([]);
    expect(
      groupTerminals([terminal("hyoui:%31", { pid: 5177 })], []).map((one) => one.section),
    ).toEqual(["unattached"]);
  });

  test("並びは新しい順で、開始を言わない端末が最後", () => {
    const rows = [
      terminal("hyoui:a", { pid: 1, started_at: NOW - 1_000 }),
      terminal("hyoui:b", { pid: 2, started_at: undefined }),
      terminal("hyoui:c", { pid: 3, started_at: NOW }),
    ];
    expect(groupTerminals(rows, [])[0]?.rows.map((row) => row.id)).toEqual([
      "hyoui:c",
      "hyoui:a",
      "hyoui:b",
    ]);
  });

  test("起動中はハーネスの端末だけ (人が開いた shell は入らない)", () => {
    const rows = [
      terminal("hyoui:%31", { pid: 5177 }),
      terminal("hyoui:%42", { command: ["/opt/bin/claude"], pid: 6033 }),
    ];
    expect(startingTerminals(rows, []).map((row) => row.id)).toEqual(["hyoui:%42"]);
  });

  test("セッションの端末は pid の一致で出る。run が消えれば空になる", () => {
    const rows = [terminal("hyoui:%17", { command: ["claude"], pid: 4821 })];
    expect(sessionTerminals(SID, rows, [agent(4821, { sid: SID })]).map((row) => row.id)).toEqual([
      "hyoui:%17",
    ]);
    expect(sessionTerminals(SID, rows, [])).toEqual([]);
    // 同じ pid でも host が違えば別のプロセス。
    expect(sessionTerminals(SID, rows, [agent(4821, { sid: SID, instance: OTHER })])).toEqual([]);
  });

  test("id で 1 つ引ける", () => {
    const rows = [terminal("hyoui:%17"), terminal("hyoui:%31")];
    expect(terminalById(rows, "hyoui:%31")?.id).toBe("hyoui:%31");
    expect(terminalById(rows, "tmux:0")).toBeUndefined();
  });
});
