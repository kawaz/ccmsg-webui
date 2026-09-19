/** 頁を横へ送る (狭い画面の一覧 ⇄ 本文)。
 *
 * `scroll-behavior: smooth` に任せない理由は**長さを決められない**から — かかる
 * 時間はブラウザのもので、端末ごとに違う。ここで要るのは「どちらへ動いたか」が
 * 見える最短で、それは待たせる時間ではないので、こちら側で決める。
 *
 * 動かすのは scroll 位置そのもの (transform ではない) なので、指で送った時と
 * 同じ道を通る — 送り終わりは scroll-snap が決め、`scrollend` が言う。 */

/** 送るのにかける時間。 */
export const SLIDE_MS = 200;

/** こちらが送っている最中か。
 *
 * 送っている間に `scrollend` を真に受けると、**まだ着いていない所を「収まった
 * 所」として読む** — 送り始めの数フレームは元の頁の側に居るので、そこで URL を
 * 書き戻すと、開いたばかりの頁が自分で閉じる (実機で観測)。 */
export function sliding(box: HTMLElement): boolean {
  return box.dataset["sliding"] !== undefined;
}

function stillWanted(): boolean {
  return !matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function slideTo(box: HTMLElement, left: number, ms: number = SLIDE_MS): void {
  const from = box.scrollLeft;
  const by = left - from;
  if (Math.abs(by) < 1) return;
  if (!stillWanted()) {
    box.scrollLeft = left;
    return;
  }

  // **送っている間だけ吸着を外す**。吸着を効かせたまま 1 フレームずつ動かすと、
  // どのフレームも「近い方へ寄せる」対象になり、半分を越えるまで元の頁へ引き
  // 戻されて動かない (実機で観測)。終わりは頁の端ちょうどなので、戻した瞬間に
  // 跳ねることはない。
  box.style.scrollSnapType = "none";
  box.dataset["sliding"] = "";
  const began = performance.now();
  let wrote = from;
  const done = (): void => {
    box.style.scrollSnapType = "";
    delete box.dataset["sliding"];
  };
  const step = (now: number): void => {
    // **人が送り始めたら譲る**。前のフレームで書いた所から動いているなら、動かして
    // いるのは指かホイールで、こちらが上書きし続けると送れない画面になる。
    if (Math.abs(box.scrollLeft - wrote) > 2) {
      done();
      return;
    }
    const part = Math.min(1, (now - began) / ms);
    // 終わりに向かって緩める。動き出しを速くするのは、送ったことが先に伝わる方が
    // 「効いた」と分かるから。
    wrote = from + by * (1 - (1 - part) ** 3);
    box.scrollLeft = wrote;
    wrote = box.scrollLeft;
    if (part < 1) {
      requestAnimationFrame(step);
      return;
    }
    done();
  };
  requestAnimationFrame(step);
}
