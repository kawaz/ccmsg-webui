// 描画層の算術: 持っている窓のうちどこを描くか、上に行が足された時に読んで
// いる行をどう置き直すか、描かれていない行へどう届くか。
//
// DOM を持たない層なので、ここで固定するのは「同じ高さの並びに対して同じ答えを
// 返すこと」だけ。実際に測るのも動かすのも `ui/Timeline.tsx` の仕事で、そちらは
// 実機で確かめる (docs/DESIGN-ja.md の Timeline 節)。
import { describe, expect, test } from "bun:test";
import {
  anchorAt,
  anchorCentering,
  HeightBook,
  isAtBottom,
  offsetOf,
  sameRange,
  scrollTopAt,
  scrollTopByGrowth,
  totalHeight,
  visibleRange,
} from "../src/timeline/virtual-window.ts";
import { groupIndexByUnitKey } from "../src/search/timeline-units.ts";
import type { TimelineNode } from "../src/timeline/items.ts";

/** 100px の行が n 本。数え上げを暗算で追えるようにする。 */
function even(n: number, px = 100): number[] {
  return Array.from({ length: n }, () => px);
}

/** 行の名前は byte 位置なので、n 本目は `n * 100`。 */
function names(n: number): string[] {
  return Array.from({ length: n }, (_, at) => String(at * 100));
}

describe("見える範囲", () => {
  test("viewport に入る分だけを描き、上下の残りは空白の高さになる", () => {
    const range = visibleRange(even(100), 1000, 500, 0);
    expect(range).toEqual({ first: 10, last: 15, before: 1000, after: 8500 });
    expect(range.before + (range.last - range.first) * 100 + range.after).toBe(
      totalHeight(even(100)),
    );
  });

  test("overscan の分だけ広く描く (指が動いた先に何も無い、を避ける)", () => {
    const range = visibleRange(even(100), 1000, 500, 300);
    expect(range.first).toBe(7);
    expect(range.last).toBe(18);
    expect(range.before).toBe(offsetOf(even(100), 7));
  });

  test("高さがまちまちでも、描く範囲は積み上げた実寸で決まる", () => {
    const heights = [500, 20, 20, 800, 20, 20];
    // 先頭の 500 を過ぎた所から、520+20+800 = 1340 まで。
    expect(visibleRange(heights, 500, 400, 0)).toEqual({
      first: 1,
      last: 4,
      before: 500,
      after: 40,
    });
  });

  test("窓が空なら何も描かず、空でなければ必ず 1 つは描く", () => {
    expect(visibleRange([], 0, 500, 0)).toEqual({ first: 0, last: 0, before: 0, after: 0 });
    // まだ何も測れていない最初の描画 (viewport 0)。1 つ描かなければ 1 つも
    // 測れず、次の描画が永遠に来ない。
    expect(visibleRange(even(10), 0, 0, 0).last).toBe(1);
  });

  test("窓が縮んで並びの外に落ちても、最後の 1 つに寄せる", () => {
    const range = visibleRange(even(3), 5000, 500, 0);
    expect(range.first).toBe(2);
    expect(range.last).toBe(3);
    expect(range.after).toBe(0);
  });

  test("同じ範囲かどうかで描き直すかを決める", () => {
    const heights = even(100);
    // 行の境目をまたがない動きでは範囲が変わらない = 描き直さない。
    expect(
      sameRange(visibleRange(heights, 1010, 500, 0), visibleRange(heights, 1040, 500, 0)),
    ).toBe(true);
    expect(
      sameRange(visibleRange(heights, 1010, 500, 0), visibleRange(heights, 1200, 500, 0)),
    ).toBe(false);
  });
});

describe("末尾に張り付く", () => {
  test("端の数 px は端とみなす", () => {
    expect(isAtBottom({ scrollHeight: 1000, scrollTop: 500, clientHeight: 490 }, 24)).toBe(true);
    expect(isAtBottom({ scrollHeight: 1000, scrollTop: 400, clientHeight: 490 }, 24)).toBe(false);
  });

  test("末尾に居るなら、末尾に足されても末尾のまま", () => {
    const before = even(10);
    const bottom = totalHeight(before) - 500;
    expect(
      isAtBottom({ scrollHeight: totalHeight(before), scrollTop: bottom, clientHeight: 500 }, 24),
    ).toBe(true);
    const after = even(12);
    // 追記のあとに末尾へ置き直すと、描く範囲は最後の行を含む。
    const range = visibleRange(after, totalHeight(after) - 500, 500, 0);
    expect(range.last).toBe(12);
    expect(range.after).toBe(0);
  });
});

describe("上に足された時に読んでいる行が動かない", () => {
  test("遡って前に 3 行足されても、覚えている行は同じ位置に居る", () => {
    const held = names(10);
    const heights = even(10);
    // 5 行目の上端から 30px 下を見ている。
    const anchor = anchorAt(held, heights, 530, 5);
    expect(anchor).toEqual({ key: "500", gap: 30 });

    // 遡り: 前に 3 行 (高さ 200 ずつ) が付く。名前は前に伸びるので、覚えて
    // いる名前はそのまま同じ行を指す。
    const grown = ["a", "b", "c", ...held];
    const growHeights = [200, 200, 200, ...heights];
    expect(scrollTopAt(grown, growHeights, anchor!)).toBe(600 + 500 + 30);
    // 動かした先で見ている行は、やはり同じ行。
    const range = visibleRange(growHeights, scrollTopAt(grown, growHeights, anchor!)!, 500, 0);
    expect(grown[range.first]).toBe("500");
  });

  test("測り直しで上の行の高さが変わっても、読んでいる行は動かない", () => {
    const held = names(10);
    const anchor = anchorAt(held, even(10), 530, 5)!;
    // 上の 5 行が実は 250px だった。
    const remeasured = [250, 250, 250, 250, 250, 100, 100, 100, 100, 100];
    expect(scrollTopAt(held, remeasured, anchor)).toBe(1250 + 30);
  });

  test("行ごと窓から落ちていれば置き直さない", () => {
    const anchor = anchorAt(names(10), even(10), 530, 5)!;
    expect(scrollTopAt(names(3), even(3), anchor)).toBeUndefined();
  });

  test("錨のかたまりが繋がり直して名前が消えたら、窓が伸びた分だけずらす", () => {
    // 窓の先頭のかたまりは、前の頁が付くとその頁と 1 つに繋がり直すことがある。
    // 覚えていた名前はもう誰も指していないので、伸びた分で答える。
    const grown = totalHeight([200, 200, 200, ...even(10)]);
    expect(scrollTopByGrowth(30, totalHeight(even(10)), grown)).toBe(630);
    // 縮んだ (先頭が落ちた) なら上へ。窓の手前より上には行かない。
    expect(scrollTopByGrowth(30, totalHeight(even(10)), totalHeight(even(3)))).toBe(0);
  });
});

describe("一致した行へ届く", () => {
  /** 1 行だけのかたまりと、畳まれた 3 行のかたまり。 */
  const groups = [
    { kind: "row", row: { item: { id: "0" } } },
    {
      kind: "fold",
      rows: [{ item: { id: "100" } }, { item: { id: "200" } }, { item: { id: "300" } }],
    },
    { kind: "row", row: { item: { id: "400" } } },
  ] as unknown as readonly TimelineNode[];

  test("畳まれた中の行も、それを含むかたまりの名前で引ける", () => {
    const at = groupIndexByUnitKey(groups);
    expect(at.get("0")).toBe(0);
    expect(at.get("200")).toBe(1);
    expect(at.get("400")).toBe(2);
    expect(at.get("999")).toBeUndefined();
  });

  test("描かれていない行でも、覚えている高さから位置を出せる", () => {
    const held = names(100);
    const heights = even(100);
    // 今見ているのは先頭。90 行目は描かれていない。
    expect(visibleRange(heights, 0, 500, 600).last).toBeLessThan(90);

    const anchor = anchorCentering(held, heights, "9000", 500)!;
    const to = scrollTopAt(held, heights, anchor)!;
    // 動かした先では、その行が描く範囲に入っている。
    const range = visibleRange(heights, to, 500, 600);
    expect(range.first).toBeLessThanOrEqual(90);
    expect(range.last).toBeGreaterThan(90);
    // 画面の真ん中に来る。
    expect(to + 250).toBe(9000 + 50);
  });

  test("動かした先で高さを測り直しても、その行は真ん中に居続ける", () => {
    const held = names(100);
    const anchor = anchorCentering(held, even(100), "9000", 500)!;
    // 間に居た行が実は倍の高さだった。
    const remeasured = even(100).map((px, at) => (at < 90 ? px * 2 : px));
    const to = scrollTopAt(held, remeasured, anchor)!;
    expect(to + 250).toBe(18000 + 50);
    const range = visibleRange(remeasured, to, 500, 600);
    expect(range.first).toBeLessThanOrEqual(90);
    expect(range.last).toBeGreaterThan(90);
  });

  test("行が画面より高ければ上端に揃える", () => {
    const anchor = anchorCentering(names(3), [100, 900, 100], "100", 500)!;
    expect(anchor.gap).toBe(0);
    expect(scrollTopAt(names(3), [100, 900, 100], anchor)).toBe(100);
  });

  test("先頭の行を真ん中に置こうとすると窓の手前を指す (丸めるのは呼ぶ側)", () => {
    const held = names(100);
    const anchor = anchorCentering(held, even(100), "0", 500)!;
    // 窓の上には端の 1 行が載っているので、ここで 0 に丸めるとその分だけ
    // 読み手が押し下げられる。
    expect(scrollTopAt(held, even(100), anchor)).toBe(-200);
  });

  test("窓の手前を読んでいる錨は負のまま返る", () => {
    const held = names(10);
    // 窓の先頭より 40px 上 (端の 1 行の所) を見ている。
    const anchor = anchorAt(held, even(10), -40, 0)!;
    expect(anchor).toEqual({ key: "0", gap: -40 });
    expect(scrollTopAt(held, even(10), anchor)).toBe(-40);
  });

  test("持っていない行には届かない", () => {
    expect(anchorCentering(names(10), even(10), "99999", 500)).toBeUndefined();
  });
});

describe("測った高さの覚え書き", () => {
  test("測っていない行には、測った分の平均を返す", () => {
    const book = new HeightBook(48);
    expect(book.heights(["a", "b"])).toEqual([48, 48]);
    book.measured("a", 200);
    expect(book.heights(["a", "b"])).toEqual([200, 200]);
    book.measured("b", 100);
    expect(book.heights(["a", "b", "c"])).toEqual([200, 100, 150]);
  });

  test("半 px 以下の違いは覚え直さない (測る→描く→測るが止まらなくなる)", () => {
    const book = new HeightBook(48);
    expect(book.measured("a", 100)).toBe(true);
    expect(book.measured("a", 100.2)).toBe(false);
    expect(book.measured("a", 120)).toBe(true);
  });

  test("測り直した分だけ平均も動く", () => {
    const book = new HeightBook(48);
    book.measured("a", 100);
    book.measured("a", 300);
    expect(book.heights(["a", "b"])).toEqual([300, 300]);
  });

  test("窓が手放した行のことは忘れる", () => {
    const book = new HeightBook(48);
    book.measured("a", 300);
    book.measured("b", 100);
    book.keep(["b"]);
    // 平均も残っている行だけで数え直される。
    expect(book.heights(["b", "c"])).toEqual([100, 100]);
  });

  test("覚えている数が行数より少なくても、落ちた行は忘れる", () => {
    // 追記で行が増えながら先頭が落ちていく間はいつもこの形になる。数で
    // 早じまいすると、落ちた行の高さが平均に混ざったまま残り続ける。
    const book = new HeightBook(48);
    book.measured("a", 300);
    book.measured("b", 100);
    book.keep(["b", "c", "d"]);
    expect(book.heights(["b", "c"])).toEqual([100, 100]);
  });
});
