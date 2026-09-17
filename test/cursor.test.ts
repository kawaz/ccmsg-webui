import { describe, expect, test } from "bun:test";
import type { PeerInfo, Sid } from "@ccmsg/protocol";
import { listUnits, stepCursor, unitAt, unitKey } from "../src/sessions-cursor.ts";
import type { SessionGroup } from "../src/sessions.ts";
import { item } from "./item.ts";
import { hasVoiceNeighbour, stepInVoice, stepItem } from "../src/timeline/voice-nav.ts";

/** 一覧のカーソルと、transcript の選択が辿る軸 (DR-0003 §2.2、§2.7)。 */

function sid(name: string): Sid {
  return name as Sid;
}

function group(section: SessionGroup["section"], sids: readonly string[]): SessionGroup {
  return {
    section,
    rows: sids.map((one) => ({ sid: sid(one), instance: "i" }) as unknown as PeerInfo),
  };
}

const GROUPS: readonly SessionGroup[] = [group("live", ["a", "b"]), group("paused", ["c"])];

describe("一覧はセクションとセッションを兼ねて辿る", () => {
  test("開いているセクションは、見出しの次にその行が並ぶ", () => {
    expect(listUnits(GROUPS, new Set()).map(unitKey)).toEqual([
      "section live",
      "session a",
      "session b",
      "section paused",
      "session c",
    ]);
  });

  test("畳んだセクションは 1 単位になる", () => {
    expect(listUnits(GROUPS, new Set(["live"])).map(unitKey)).toEqual([
      "section live",
      "section paused",
      "session c",
    ]);
  });

  test("上下は見出しと行を同じ軸で跨ぐ", () => {
    const units = listUnits(GROUPS, new Set());
    expect(stepCursor(units, "session b", 1)).toBe("section paused");
    expect(stepCursor(units, "section paused", -1)).toBe("session b");
  });

  test("端では動かない", () => {
    const units = listUnits(GROUPS, new Set());
    expect(stepCursor(units, "section live", -1)).toBeUndefined();
    expect(stepCursor(units, "session c", 1)).toBeUndefined();
  });

  test("カーソルがどこにも居なければ、動かす向きの端から始まる", () => {
    const units = listUnits(GROUPS, new Set());
    expect(stepCursor(units, undefined, 1)).toBe("section live");
    expect(stepCursor(units, undefined, -1)).toBe("session c");
    // 畳んで見えなくなった行は、もうこの軸に居ない。
    expect(unitAt(listUnits(GROUPS, new Set(["live"])), "session a")).toBeUndefined();
  });

  test("並ぶものが何も無ければ、どこへも動かない", () => {
    expect(stepCursor([], undefined, 1)).toBeUndefined();
  });
});

describe("同じ声を辿る", () => {
  // 人 → セッション → 人 → 別のセッション、と交互に並んだ transcript。
  const items = [
    item("message.user.in", {}, { uuid: "r1" }),
    item("tool.Bash", {}, { uuid: "r2" }),
    item("message.user.in", {}, { uuid: "r3" }),
    item("message.session.in", { from: "other" }, { uuid: "r4" }),
    item("message.user.in", {}, { uuid: "r5" }),
  ];
  const at = (index: number): string => items[index]?.id ?? "";

  test("同じ相手の同じ段だけを飛ぶ", () => {
    expect(stepInVoice(items, at(0), 1)).toBe(at(2));
    expect(stepInVoice(items, at(2), 1)).toBe(at(4));
    expect(stepInVoice(items, at(4), -1)).toBe(at(2));
  });

  test("その向きに同じ声が居なければ動かない", () => {
    expect(stepInVoice(items, at(4), 1)).toBeUndefined();
    expect(hasVoiceNeighbour(items, at(4), 1)).toBe(false);
    expect(hasVoiceNeighbour(items, at(4), -1)).toBe(true);
  });

  test("別の相手の声は、同じ段でも別の列", () => {
    expect(stepInVoice(items, at(3), 1)).toBeUndefined();
    expect(stepInVoice(items, at(3), -1)).toBeUndefined();
  });

  test("選んでいる 1 通が無ければ、辿る列そのものが決まらない", () => {
    expect(stepInVoice(items, undefined, 1)).toBeUndefined();
  });

  test("上下は声を問わず 1 つずつ動く", () => {
    expect(stepItem(items, at(0), 1)).toBe(at(1));
    expect(stepItem(items, undefined, 1)).toBe(at(0));
    expect(stepItem(items, at(4), 1)).toBeUndefined();
  });
});
