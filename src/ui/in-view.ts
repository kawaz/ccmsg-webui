/** 画面に出ているか、を測る所。
 *
 * 長い transcript では画面に載っていない所の方がずっと多い。そこまで時計を
 * 刻んだり、そこに書かれた語を instance に訊いたりすると、読んでいる所の手が
 * 止まる。測るのは `IntersectionObserver` で、画面の中に少しでも入れば出て
 * いる扱い — 端で半分隠れているものも、読み手にとっては出ている。
 *
 * observer は 1 つを皆で使う。要素ごとに作ると、1 つの文書に数百の観測者が
 * 並ぶことになる。 */

let watcher: IntersectionObserver | undefined;
const watched = new WeakMap<Element, (visible: boolean) => void>();

export function watchInView(el: Element, tell: (visible: boolean) => void): () => void {
  if (typeof IntersectionObserver === "undefined") {
    // 測る術が無い所 (DOM を持たない環境) では、出ているものとして扱う。
    // 相対時刻が止まって見えるより、余分に描き直す方がまだよい。
    tell(true);
    return () => {};
  }
  watcher ??= new IntersectionObserver((entries) => {
    for (const entry of entries) watched.get(entry.target)?.(entry.isIntersecting);
  });
  watched.set(el, tell);
  watcher.observe(el);
  return () => {
    watched.delete(el);
    watcher?.unobserve(el);
  };
}
