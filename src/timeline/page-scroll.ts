/** 窓を動かすのは頁そのもの。
 *
 * 仮想化の算術 (`virtual-window.ts`) が要るのは「今どこを見ているか」「どれだけ
 * 見えているか」「どこまで伸びているか」の 3 つで、それを**どの scroller から
 * 読むか**は算術の外側の話。ここはその 1 か所で、頁 (= window) を scroller と
 * して読み書きする。
 *
 * 読みと書きで別の物を触らない: 読むのも書くのも `scrollingElement` で、
 * `scrollTo` を使わないのは、CSS の `scroll-behavior` が滑らかに動かす設定に
 * 変わった時に置き直しが 1 フレームで終わらなくなるから。 */

function scroller(): Element {
  return document.scrollingElement ?? document.documentElement;
}

/** 頁の先頭を 0 とした、今見えている所の上端。 */
export function pageScrollTop(): number {
  return scroller().scrollTop;
}

/** 今見えている高さ。 */
export function pageViewport(): number {
  return scroller().clientHeight;
}

/** 頁ぜんぶの長さ。 */
export function pageScrollHeight(): number {
  return scroller().scrollHeight;
}

/** 末尾に張り付いているかを尋ねるための、3 つまとめ。 */
export function pageMetrics(): {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
} {
  const element = scroller();
  return {
    scrollHeight: element.scrollHeight,
    scrollTop: element.scrollTop,
    clientHeight: element.clientHeight,
  };
}

export function scrollPageTo(top: number): void {
  scroller().scrollTop = top;
}

/** 頁の先頭を 0 とした、その要素の上端。 */
export function pageTopOf(element: Element): number {
  return element.getBoundingClientRect().top + pageScrollTop();
}
