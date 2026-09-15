import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { holdNow, nowFor, nowOf, relativeAge } from "../now.ts";

/** どのくらい前か、を 1 つ出す所。
 *
 * 見えている間だけ時計を読む。長い transcript では画面に載っていない行の方が
 * ずっと多く、そこまで刻むたびに描き直すと、読んでいる所の手が止まる。
 * 見えているかを測るのは `IntersectionObserver` で、画面の中に少しでも入れば
 * 見えている扱い — 端で半分隠れている行も、読み手にとっては出ている。 */

let watcher: IntersectionObserver | undefined;
const watched = new WeakMap<Element, (visible: boolean) => void>();

function watch(el: Element, tell: (visible: boolean) => void): () => void {
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

export function RelativeTime({ at, class: className }: { at: number; class?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const visible = useSignal(false);
  // 最後に読んだ今。見えていない間はこれが据え置かれ、粒度もこれで決まる。
  const last = useRef(nowOf("s10").peek());
  useEffect(() => {
    const el = box.current;
    if (el === null) return;
    const release = holdNow();
    const stop = watch(el, (seen) => {
      visible.value = seen;
    });
    return () => {
      stop();
      release();
    };
  }, [visible]);
  const now = nowFor(at, visible.value, last.current);
  last.current = now;
  return (
    <span
      ref={box}
      class={className === undefined ? "tl-when" : `tl-when ${className}`}
      title={new Date(at).toLocaleString()}
    >
      {relativeAge(now - at)}
    </span>
  );
}
