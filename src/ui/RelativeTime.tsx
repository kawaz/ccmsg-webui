import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { holdNow, nowFor, nowOf, relativeAge } from "../now.ts";
import { watchInView } from "./in-view.ts";

/** どのくらい前か、を 1 つ出す所。
 *
 * 見えている間だけ時計を読む (`in-view.ts`)。刻む先が画面の外なら、読んで
 * いる所を描き直すだけ損になる。 */

export function RelativeTime({ at, class: className }: { at: number; class?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const visible = useSignal(false);
  // 最後に読んだ今。見えていない間はこれが据え置かれ、粒度もこれで決まる。
  const last = useRef(nowOf("s10").peek());
  useEffect(() => {
    const el = box.current;
    if (el === null) return;
    const release = holdNow();
    const stop = watchInView(el, (seen) => {
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
