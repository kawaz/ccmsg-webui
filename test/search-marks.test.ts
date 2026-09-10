// 色付いたコードの上に検索のハイライトを重ねる層 (search-marks.tsx)。
//
// Shiki を実際に通した token 列に対して確かめる: 一致が token の境界をまたいで
// いても光り、光らせた後も元の token (色) がそのまま残っていること。素の span
// 配列を手で書くだけだと「Shiki がどこで切るか」を仮定してしまうので、ここは
// 本物の tokenizeLines を通す。
import { describe, expect, test } from "bun:test";
import type { VNode } from "preact";
import { tokenizeLines } from "../src/markdown/highlight.ts";
import { parseSearchQuery } from "../src/search/in-view-search.ts";
import { markedSpans, markedText } from "../src/ui/search-marks.tsx";

const PLAIN = { caseSensitive: false, regex: false };

function words(query: string) {
  return parseSearchQuery(query, PLAIN).words;
}

function isVNode(x: unknown): x is VNode {
  return x != null && typeof x === "object" && "type" in x && "props" in x;
}

/** 描かれる文字を全部つなぐ。光らせても文字が増減しないことを見るのに使う。 */
function textOf(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (!isVNode(node)) return "";
  return textOf((node.props as { children?: unknown }).children);
}

function collect(node: unknown, type: string, acc: VNode[] = []): VNode[] {
  if (Array.isArray(node)) {
    for (const one of node) collect(one, type, acc);
    return acc;
  }
  if (!isVNode(node)) return acc;
  if (node.type === type) acc.push(node);
  collect((node.props as { children?: unknown }).children, type, acc);
  return acc;
}

/** 色を持っている (= Shiki が style を付けた) span だけ。 */
function styledSpans(node: unknown): VNode[] {
  return collect(node, "span").filter(
    (one) => typeof (one.props as { style?: unknown }).style === "string",
  );
}

describe("色付いたコードの上のハイライト", () => {
  test("token を跨ぐ一致が光り、元の token の色は残る", async () => {
    const [line] = await tokenizeLines("const answer = 42;", "tsx");
    expect(line).toBeDefined();
    const spans = line as NonNullable<typeof line>;
    // Shiki は宣言・空白・名前を別の token に切る。その境目を跨ぐ 1 つの句
    // (ダブルクオート) を探す — 空白区切りは AND の別ワードになるので、
    // 「1 つの一致が token を跨ぐ」を見るには句である必要がある。
    expect(spans.length).toBeGreaterThan(1);
    const styledBefore = spans.filter((span) => span.style !== undefined).length;
    expect(styledBefore).toBeGreaterThan(0);

    const rendered = markedSpans(spans, words('"const answer"'));
    expect(textOf(rendered)).toBe("const answer = 42;");

    const marks = collect(rendered, "mark");
    expect(marks.length).toBeGreaterThan(1); // 跨いだ分だけ mark に分かれる
    expect(marks.every((mark) => (mark.props as { class?: string }).class === "search-hl")).toBe(
      true,
    );
    expect(marks.map((mark) => textOf(mark)).join("")).toBe("const answer");

    // 色付けの span は 1 つも消えていない (mark の中に入っているだけ)。
    expect(styledSpans(rendered).length).toBeGreaterThanOrEqual(styledBefore);
    for (const span of styledSpans(rendered)) {
      expect((span.props as { class?: string }).class).toBe("shiki-tok");
    }
  });

  test("探していない時は token をそのまま出す (包む要素を増やさない)", async () => {
    const [line] = await tokenizeLines("const answer = 42;", "tsx");
    const spans = line as NonNullable<typeof line>;
    const rendered = markedSpans(spans, []);
    expect(textOf(rendered)).toBe("const answer = 42;");
    expect(collect(rendered, "mark")).toEqual([]);
    expect(styledSpans(rendered).length).toBe(spans.filter((s) => s.style !== undefined).length);
  });

  test("色が届く前の素の文でも同じ `<mark>` で光る", () => {
    const rendered = markedText("const answer = 42;", words("answer"));
    expect(textOf(rendered)).toBe("const answer = 42;");
    const marks = collect(rendered, "mark");
    expect(marks.length).toBe(1);
    const mark = marks[0] as VNode;
    expect(textOf(mark)).toBe("answer");
    expect((mark.props as { class?: string }).class).toBe("search-hl");
  });

  test("探していない時の素の文は元の文そのもの", () => {
    expect(markedText("const answer = 42;", [])).toBe("const answer = 42;");
  });
});
