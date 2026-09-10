import type { VNode } from "preact";
import type { HighlightSpan } from "../markdown/highlight.ts";
import {
  type SearchWord,
  splitForHighlight,
  splitSpansForHighlight,
} from "../search/in-view-search.ts";

/** 探している言葉を光らせる、描く側の 2 通り。
 *
 * 色が付いていない文は切って `<mark>` を挟むだけでよく、色付きの行は既に span
 * の列なので同じ切り方を span 側へ写して切り直す。どちらも同じ `<mark>` を出す
 * ので、コードの中でも地の文でも光り方は変わらない。 */

/** まだ色の付いていない文。探していない時と一致が無い時は元の文をそのまま
 * 返すので、囲むための要素が増えることはない。 */
export function markedText(
  text: string,
  words: readonly SearchWord[],
): (VNode | string)[] | string {
  if (words.length === 0) return text;
  return splitForHighlight(text, words).map((piece, at) =>
    piece.color === undefined ? (
      piece.text
    ) : (
      <mark key={at} class="search-hl" data-search-color={piece.color}>
        {piece.text}
      </mark>
    ),
  );
}

/** 色付け済みの 1 行。一致が色の境界をまたいでも、span を切り直すので色は
 * 消えない。 */
export function markedSpans(
  spans: readonly HighlightSpan[],
  words: readonly SearchWord[],
): (VNode | string)[] {
  // 探していない時は span を包まない。光らせるための入れ物が、探していない
  // 間ずっと行ごとに積み上がるのを避ける。
  if (words.length === 0) {
    return spans.map((span, at) =>
      span.style === undefined ? (
        span.text
      ) : (
        <span class="shiki-tok" style={span.style} key={at}>
          {span.text}
        </span>
      ),
    );
  }
  return splitSpansForHighlight(spans, words).map((span, at) => {
    const body =
      span.style === undefined ? (
        span.text
      ) : (
        <span class="shiki-tok" style={span.style}>
          {span.text}
        </span>
      );
    return span.color === undefined ? (
      <span key={at}>{body}</span>
    ) : (
      <mark key={at} class="search-hl" data-search-color={span.color}>
        {body}
      </mark>
    );
  });
}
