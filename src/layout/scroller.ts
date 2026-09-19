import { createContext, type RefObject } from "preact";

/** 本文を動かす箱と、その箱を読むための物差し。
 *
 * 仮想化の算術 (`timeline/virtual-window.ts`) が要るのは「今どこを見ているか」
 * 「どれだけ見えているか」「どこまで伸びているか」の 3 つで、それを**どの箱から
 * 読むか**は算術の外側の話。ここがその 1 か所。
 *
 * 読むのは**本文のペイン**で、頁ではない。頁の長さは隣に並んでいる一覧も決めて
 * しまうので、一覧の方が長い日には「末尾」が本文の終わりではなく一覧の終わりに
 * なり、遷移した先で誰も居ない空白が出る。
 *
 * 箱にするのはペインそのもので、その中の囲い (`.tl-pane`) ではない。ホイールが
 * 効くのは箱の内側なので、狭い囲いを箱にすると、その外の余白 — 画面の大半 —
 * でホイールが死ぬ。ペインは本文が使える所ぜんぶなので、余白ごと箱の中に入る。
 *
 * 読みと書きで別の物を触らない: 読むのも書くのも同じ要素で、`scrollTo` を使わ
 * ないのは、CSS の `scroll-behavior` が滑らかに動かす設定に変わった時に置き直し
 * が 1 フレームで終わらなくなるから。 */
export const ScrollerContext = createContext<RefObject<HTMLElement | null> | undefined>(undefined);

/** 箱の先頭を 0 とした、今見えている所の上端。 */
export function scrollTopOf(box: HTMLElement): number {
  return box.scrollTop;
}

/** 今見えている高さ。 */
export function viewportOf(box: HTMLElement): number {
  return box.clientHeight;
}

/** 箱の中身ぜんぶの長さ。 */
export function scrollHeightOf(box: HTMLElement): number {
  return box.scrollHeight;
}

/** 末尾に張り付いているかを尋ねるための、3 つまとめ。 */
export function metricsOf(box: HTMLElement): {
  scrollHeight: number;
  scrollTop: number;
  clientHeight: number;
} {
  return {
    scrollHeight: box.scrollHeight,
    scrollTop: box.scrollTop,
    clientHeight: box.clientHeight,
  };
}

export function scrollBoxTo(box: HTMLElement, top: number): void {
  box.scrollTop = top;
}

/** 箱の先頭を 0 とした、その要素の上端。
 *
 * 箱そのものの位置を引いてから今の位置を足す: 箱は頁の途中に居るので、頁の
 * 先頭からの距離をそのまま使うと、上のバーの高さだけずれる。 */
export function topOf(box: HTMLElement, element: Element): number {
  return element.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
}

/** カーソルの行を**縦だけ**で窓の中に入れる。
 *
 * `scrollIntoView` を使わないのは、あれが**動かせる祖先を全部動かす**から —
 * 狭い画面では一覧と本文が横に並んだ頁になっている (DR-0004 §2.4) ので、一覧の
 * 行を見せようとした横の動きが、本文の頁を開いたばかりの画面を一覧へ引き戻す
 * (実機で観測: 送っている最中の scroll が 136 → 68 と巻き戻る)。
 *
 * 要るのは縦だけで、横は**頁がどちらに居るか**という別の話。だから動かすのは
 * 行を縦に動かしている箱 1 つに限る。 */
export function keepInViewVertically(row: HTMLElement, box: HTMLElement): void {
  const at = row.getBoundingClientRect();
  const window = box.getBoundingClientRect();
  if (at.top < window.top) box.scrollTop -= window.top - at.top;
  else if (at.bottom > window.bottom) box.scrollTop += at.bottom - window.bottom;
}
