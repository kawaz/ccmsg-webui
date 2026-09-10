// 2 ペインの境目の覚え方 (layout/split-width.ts): 名前の付け方と、手で
// 書き換えられた値・古い build が書いた値をどう読むか。
import { describe, expect, test } from "bun:test";
import {
  clampSplitWidth,
  formatSplitWidth,
  parseSplitWidth,
  SPLIT_MAX_PX,
  SPLIT_MIN_PX,
  splitStorageKey,
} from "../src/layout/split-width.ts";

describe("覚える名前", () => {
  test("instance を名前に含める (1 つの store に複数の instance が届く)", () => {
    expect(splitStorageKey("inst-a")).toBe("ccmsg.layout.split:inst-a");
    expect(splitStorageKey("inst-b")).not.toBe(splitStorageKey("inst-a"));
  });
});

describe("幅の読み書き", () => {
  test("覚えた幅がそのまま戻る", () => {
    const key = splitStorageKey("inst-a");
    const store = new Map<string, string>();
    store.set(key, formatSplitWidth(260));
    expect(parseSplitWidth(store.get(key))).toBe(260);
  });

  test("端は範囲に収まる", () => {
    expect(clampSplitWidth(0)).toBe(SPLIT_MIN_PX);
    expect(clampSplitWidth(10_000)).toBe(SPLIT_MAX_PX);
    expect(clampSplitWidth(260.4)).toBe(260);
    expect(parseSplitWidth(formatSplitWidth(10_000))).toBe(SPLIT_MAX_PX);
  });

  test("覚えていない・読めない・範囲外は「覚えていない」と同じ", () => {
    expect(parseSplitWidth(undefined)).toBeUndefined();
    expect(parseSplitWidth("")).toBeUndefined();
    expect(parseSplitWidth("ひろめ")).toBeUndefined();
    expect(parseSplitWidth("NaN")).toBeUndefined();
    expect(parseSplitWidth(String(SPLIT_MIN_PX - 1))).toBeUndefined();
    expect(parseSplitWidth(String(SPLIT_MAX_PX + 1))).toBeUndefined();
  });
});
