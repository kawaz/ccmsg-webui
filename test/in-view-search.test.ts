// 表示中のものを探す層 — クエリの読み取り、一致の列挙、index の巡回。
import { describe, expect, test } from "bun:test";
import {
  highlightRanges,
  matchesQuery,
  matchingKeys,
  nextIndex,
  parseSearchQuery,
  prevIndex,
  splitForHighlight,
  splitSpansForHighlight,
} from "../src/search/in-view-search.ts";

const PLAIN = { caseSensitive: false, regex: false };
const REGEX = { caseSensitive: false, regex: true };

function words(query: string, options = PLAIN) {
  return parseSearchQuery(query, options).words;
}

describe("クエリの読み取り", () => {
  test("行内の空白は AND、改行は OR", () => {
    const query = words("foo bar\nbaz");
    expect(query.map((word) => word.text)).toEqual(["foo", "bar", "baz"]);
    expect(query.map((word) => word.clause)).toEqual([0, 0, 1]);

    expect(matchesQuery("foo and bar", query)).toBe(true);
    expect(matchesQuery("foo only", query)).toBe(false);
    expect(matchesQuery("baz only", query)).toBe(true);
  });

  test("行ごとに色が変わり、同じ行のワードは同じ色", () => {
    const query = words("foo bar\nbaz");
    expect(query[0]!.color).toBe(query[1]!.color);
    expect(query[2]!.color).not.toBe(query[0]!.color);
  });

  test("ダブルクオートの句は 1 ワードで、句の中の空白は詰まっていても合う", () => {
    const query = words('"送れ ません"');
    expect(query).toHaveLength(1);
    expect(matchesQuery("送れ   ません", query)).toBe(true);
  });

  test("通常検索のワードは正規表現として読まれない", () => {
    expect(matchesQuery("axc", words("a.c"))).toBe(false);
    expect(matchesQuery("a.c", words("a.c"))).toBe(true);
  });

  test("大文字と小文字は既定では区別しない", () => {
    expect(matchesQuery("FOO", words("foo"))).toBe(true);
    expect(matchesQuery("FOO", words("foo", { caseSensitive: true, regex: false }))).toBe(false);
  });

  test("読めない正規表現はその行だけ落ち、他の行は使える", () => {
    const parsed = parseSearchQuery("a(\nbar", REGEX);
    expect(parsed.hasError).toBe(true);
    expect(matchesQuery("bar", parsed.words)).toBe(true);
    expect(matchesQuery("なにもない", parsed.words)).toBe(false);
  });
});

describe("光らせる所", () => {
  test("重なった一致は先に始まる方・長い方を採り、入れ子にしない", () => {
    const ranges = highlightRanges("foobar", words("foo foob"));
    expect(ranges).toEqual([{ start: 0, end: 4, color: 0 }]);
  });

  test("幅ゼロの一致で止まらない", () => {
    expect(highlightRanges("bbb", words("a*", REGEX))).toEqual([]);
  });

  test("探していない時は元の文をそのまま返す", () => {
    expect(splitForHighlight("そのまま", [])).toEqual([{ text: "そのまま", color: undefined }]);
  });

  test("地の文と光る所に切る", () => {
    expect(splitForHighlight("xfooy", words("foo"))).toEqual([
      { text: "x", color: undefined },
      { text: "foo", color: 0 },
      { text: "y", color: undefined },
    ]);
  });

  test("色付け済みの span を跨ぐ一致は、span を切り直して光らせる", () => {
    const spans = [
      { text: "con", style: "a" },
      { text: "st x", style: "b" },
    ];
    expect(splitSpansForHighlight(spans, words("nst"))).toEqual([
      { text: "co", style: "a" },
      { text: "n", style: "a", color: 0 },
      { text: "st", style: "b", color: 0 },
      { text: " x", style: "b" },
    ]);
  });
});

describe("何番目を見ているか", () => {
  test("一致したかたまりを出てくる順に並べる", () => {
    const units = [
      { key: "0", text: "foo" },
      { key: "12", text: "なにもない" },
      { key: "40", text: "foo again" },
    ];
    expect(matchingKeys(units, words("foo"))).toEqual(["0", "40"]);
    expect(matchingKeys(units, [])).toEqual([]);
  });

  test("↑↓ は端で巡回し、一致が無ければどこも指さない", () => {
    expect(nextIndex(3, 3)).toBe(1);
    expect(nextIndex(1, 3)).toBe(2);
    expect(prevIndex(1, 3)).toBe(3);
    expect(prevIndex(0, 0)).toBe(0);
    expect(nextIndex(0, 0)).toBe(0);
  });
});
