import { useEffect, useRef, useState } from "preact/hooks";
import {
  clampSplitWidth,
  formatSplitWidth,
  parseSplitWidth,
  SPLIT_MAX_PX,
  SPLIT_MIN_PX,
} from "../layout/split-width.ts";
import { localStore } from "../settings.ts";

/** 2 ペインの境目。掴んで動かせて、覚えている幅がその名前に残る。
 *
 * `separator` は矢印キーでも動く前提の役 (WAI-ARIA) なので、掴めるだけでなく
 * focus して ←→ でも動かせる。狭い画面では 2 つが左右に並ばなくなるため、
 * そこでは CSS が消す。
 *
 * 同じものを 2 か所で使う (ファイルの木と本文、一覧と本文) ので、違うのは
 * **名前と、覚える鍵**だけ。 */

/** 矢印キー 1 回で動く幅。 */
const STEP_PX = 16;

export function Splitter({
  label,
  width,
  measure,
  onDrag,
  onSet,
  onSettle,
  class: className,
}: {
  label: string;
  width: number | undefined;
  measure: () => number | undefined;
  onDrag: (clientX: number) => void;
  onSet: (px: number) => void;
  onSettle: () => void;
  class: string;
}) {
  const now = width ?? measure();
  return (
    <div
      class={className}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={SPLIT_MIN_PX}
      aria-valuemax={SPLIT_MAX_PX}
      {...(now === undefined ? {} : { "aria-valuenow": Math.round(now) })}
      tabIndex={0}
      onPointerDown={(event: PointerEvent) => {
        // 掴んでいる間は指が境目から離れても追う。本文の上で離しても、
        // 選択がそこで始まってしまわないように既定も止める。
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        event.preventDefault();
      }}
      onPointerMove={(event: PointerEvent) => {
        if (!(event.currentTarget as HTMLElement).hasPointerCapture(event.pointerId)) return;
        onDrag(event.clientX);
      }}
      onPointerUp={(event: PointerEvent) => {
        (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
        onSettle();
      }}
      onKeyDown={(event: KeyboardEvent) => {
        const step =
          event.key === "ArrowLeft" ? -STEP_PX : event.key === "ArrowRight" ? STEP_PX : 0;
        if (step === 0) return;
        const from = width ?? measure();
        if (from === undefined) return;
        event.preventDefault();
        onSet(from + step);
        onSettle();
      }}
    />
  );
}

/** 覚えている幅と、その書き戻し方。
 *
 * 鍵が決まるまでは覚えていない扱いにする — instance を知らないまま書くと、
 * 次に来た instance の幅として読まれてしまう。 */
export function useSplitWidth(key: string | undefined): {
  width: number | undefined;
  hold: (px: number) => void;
  keep: () => void;
} {
  const [width, setWidth] = useState<number | undefined>(undefined);
  // 書き戻す時に読むのは今の幅で、その handler が作られた時の幅ではない
  // (矢印キーは 1 回の中で動かして書くので、state の再描画を待てない)。
  const latest = useRef<number | undefined>(undefined);
  useEffect(() => {
    const held = key === undefined ? undefined : parseSplitWidth(localStore.get(key));
    latest.current = held;
    setWidth(held);
  }, [key]);
  return {
    width,
    hold(px: number) {
      const next = clampSplitWidth(px);
      latest.current = next;
      setWidth(next);
    },
    keep() {
      // 書くのは指を離した時だけ。動かしている間の 1 フレームごとに書くと、
      // 覚える価値のない途中の幅で store を叩き続けることになる。
      if (key === undefined || latest.current === undefined) return;
      localStore.set(key, formatSplitWidth(latest.current));
    },
  };
}
