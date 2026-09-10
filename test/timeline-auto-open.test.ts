import { describe, expect, test } from "bun:test";
import {
  defaultTimelineAutoOpen,
  foldShouldAutoOpen,
  parseTimelineAutoOpenSettings,
  timelineAutoOpenStorageKey,
  toggleTimelineAutoOpen,
} from "../src/timeline/timeline-auto-open.ts";
import { item, use } from "./item.ts";

describe("defaultTimelineAutoOpen", () => {
  // 親 TL はユーザ向け思考過程を自動展開するが、agent 通信と外側 items fold は閉じる。
  test("main Timeline defaults to URT with inner T open and outer items closed", () => {
    expect(defaultTimelineAutoOpen(false)).toEqual({
      thinking: true,
      ccmsg: true,
      agent: false,
      items: false,
    });
  });

  // agent TL は呼び出し元・peer との通信を主情報として自動展開し、その通信を包む
  // 外側 fold も開く。thinking は既定閉で、親 TL と関心対象を反転する。
  test("agent Timeline defaults to URA with inner A and outer items open", () => {
    expect(defaultTimelineAutoOpen(true)).toEqual({
      thinking: false,
      ccmsg: false,
      agent: true,
      items: true,
    });
  });

  // T/A の inner 軸と N items の outer 軸は独立。片方の操作が他方を書き換えると、
  // main 既定の T=true/items=false と agent 既定の A=true/items=true を表現できない。
  test("thinking, agent, and items toggles update only their own axis", () => {
    const initial = { thinking: true, ccmsg: true, agent: false, items: false };
    expect(toggleTimelineAutoOpen(initial, "agent")).toEqual({
      thinking: true,
      ccmsg: true,
      agent: true,
      items: false,
    });
    expect(toggleTimelineAutoOpen(initial, "items")).toEqual({
      thinking: true,
      ccmsg: true,
      agent: false,
      items: true,
    });
    expect(toggleTimelineAutoOpen(initial, "ccmsg")).toEqual({
      thinking: true,
      ccmsg: false,
      agent: false,
      items: false,
    });
  });
});

describe("timelineAutoOpenStorageKey", () => {
  // 親 TL は sid のみ、drilldown は sid + agent の複合キーで独立に保存される。
  test("parent Timeline omits the agent segment while a drilldown includes it", () => {
    expect(timelineAutoOpenStorageKey("ws://h/ws", "sess-1", undefined)).toBe(
      "ccmsg.tl.autoOpen:ws://h/ws:sess-1",
    );
    expect(timelineAutoOpenStorageKey("ws://h/ws", "sess-1", "worker-a")).toBe(
      "ccmsg.tl.autoOpen:ws://h/ws:sess-1/worker-a",
    );
  });

  // 別 agent は別 key = 独立した保存領域を持つ。
  test("different agents on the same session get different keys", () => {
    expect(timelineAutoOpenStorageKey("ws://h/ws", "sess-1", "worker-a")).not.toBe(
      timelineAutoOpenStorageKey("ws://h/ws", "sess-1", "worker-b"),
    );
  });

  // 同じ sid でも instance が違えば別の保存領域。
  test("the same session id on two instances gets different keys", () => {
    expect(timelineAutoOpenStorageKey("ws://a/ws", "sess-1", undefined)).not.toBe(
      timelineAutoOpenStorageKey("ws://b/ws", "sess-1", undefined),
    );
  });
});

describe("parseTimelineAutoOpenSettings", () => {
  const fallback = defaultTimelineAutoOpen(false);

  // 保存値なし (初回訪問) は fallback (= defaultTimelineAutoOpen の結果) を使う。
  test("missing key falls back to the given default", () => {
    expect(parseTimelineAutoOpenSettings(null, fallback)).toEqual(fallback);
  });

  // 保存済みの妥当な JSON はそのまま復元される。
  test("valid stored JSON is restored as-is", () => {
    const stored = { thinking: false, ccmsg: true, agent: true, items: false };
    expect(parseTimelineAutoOpenSettings(JSON.stringify(stored), fallback)).toEqual(stored);
  });

  // 壊れた JSON / 型不一致 / 欠損フィールドはすべて fallback に安全側 degrade する
  // (parseFavorites と同じ posture — 1 箇所の壊れが全体をクラッシュさせない)。
  test("corrupt or malformed stored values fall back to the given default", () => {
    expect(parseTimelineAutoOpenSettings("not json", fallback)).toEqual(fallback);
    expect(parseTimelineAutoOpenSettings("42", fallback)).toEqual(fallback);
    expect(parseTimelineAutoOpenSettings("null", fallback)).toEqual(fallback);
    expect(parseTimelineAutoOpenSettings("[]", fallback)).toEqual(fallback);
    expect(
      parseTimelineAutoOpenSettings(JSON.stringify({ thinking: true, ccmsg: true }), fallback),
    ).toEqual(fallback);
    expect(
      parseTimelineAutoOpenSettings(
        JSON.stringify({ thinking: "yes", ccmsg: true, agent: true, items: true }),
        fallback,
      ),
    ).toEqual(fallback);
  });
});

describe("foldShouldAutoOpen", () => {
  const rows = {
    thinking: [{ item: item("thinking", { text: "考える" }) }],
    ccmsg: [{ item: item("message:session:in", { text: "きた" }) }],
    agent: [{ item: use("message:sub:out", { prompt: "調べて" }) }],
    other: [{ item: use("tool:Bash", { tool_use_id: "t", command: "ls" }) }],
  };

  // 軸ごとに独立: 開くのは「その軸のものが中に居る」畳みだけで、他の軸の畳みは
  // 閉じたままになる。
  test("設定した軸の畳みだけが開く", () => {
    const only = (key: keyof typeof rows) => ({
      thinking: key === "thinking",
      ccmsg: key === "ccmsg",
      agent: key === "agent",
      items: key === "other",
    });
    for (const key of Object.keys(rows) as (keyof typeof rows)[]) {
      expect(foldShouldAutoOpen(rows[key], only(key))).toBe(true);
      for (const other of Object.keys(rows) as (keyof typeof rows)[]) {
        if (other !== key) expect(foldShouldAutoOpen(rows[other], only(key))).toBe(false);
      }
    }
  });

  test("混ざった畳みは、1 つでも設定した軸があれば開く", () => {
    const mixed = [...rows.other, ...rows.thinking];
    const settings = { thinking: true, ccmsg: false, agent: false, items: false };
    expect(foldShouldAutoOpen(mixed, settings)).toBe(true);
  });

  test("どれも設定していなければ開かない", () => {
    const off = { thinking: false, ccmsg: false, agent: false, items: false };
    expect(foldShouldAutoOpen([...rows.thinking, ...rows.other], off)).toBe(false);
  });
});
