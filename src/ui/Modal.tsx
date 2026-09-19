import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import type { Scope } from "../actions/tree.ts";
import { standing } from "../actions/tree.ts";
import { Pane, useScope } from "./Scope.tsx";

/** 画面に重なるもの (DR-0003 の「重なるもの」)。
 *
 * 重なりは**もう 1 つの区画**でしかない — 中身の側に段階を持たせると、その中身
 * だけが他と違う形になり、段階の間のキーがどこへ届くかを別に決めることになる。
 * 区画として持てば、宛先の追従も後ろの不活化も他と同じ仕組みで済む:
 * `showModal()` が後ろを丸ごと不活にし (`inert` を自分で貼らずに済む)、
 * `Escape` で閉じるのはブラウザの持ち物のまま。
 *
 * **閉じ方は 1 つ**。`Escape` も、後ろの窓の閉じる仕草も、中身が置いたボタンも
 * `close` に集まるので、閉じた時にすることを 2 回書かずに済む。 */

/** 開いた時点でここが立っている区画になる。
 *
 * 重なりも、口に付く窓も、開いた先が宛先になることは同じ — 器が dialog か
 * popover かは、キーがどこへ届くかとは関わらない。 */
export function StandHere() {
  const scope = useScope();
  useEffect(() => {
    standing.value = scope;
  }, [scope]);
  return null;
}

/** 開く前に立っていた区画を覚えておき、閉じたらそこへ返す。 */
export function useStandingReturn(): void {
  const was = useRef<Scope | undefined>(undefined);
  useEffect(() => {
    was.current = standing.peek();
    return () => {
      const back = was.current;
      if (back !== undefined) standing.value = back;
    };
  }, []);
}

export function Modal({
  label,
  kind,
  onClose,
  children,
}: {
  /** 何の重なりか。見出しにも、区画の名前にも、読み上げにも同じ言葉が出る。 */
  readonly label: string;
  /** 見た目を分ける時の添え名 (`confirm` に足される)。 */
  readonly kind?: string;
  readonly onClose: () => void;
  readonly children: ComponentChildren;
}) {
  const box = useRef<HTMLDialogElement>(null);
  useStandingReturn();

  useEffect(() => {
    const at = box.current;
    if (at !== null && !at.open) at.showModal();
  }, []);

  return (
    <dialog
      class={kind === undefined ? "confirm" : `confirm ${kind}`}
      ref={box}
      aria-label={label}
      onClose={onClose}
    >
      <Pane name="dialog" label={label} class="confirm-body">
        <StandHere />
        <h2>{label}</h2>
        {children}
      </Pane>
    </dialog>
  );
}
