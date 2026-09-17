import { useEffect, useRef } from "preact/hooks";
import { actionOf } from "../actions/catalogue.ts";
import type { Scope } from "../actions/tree.ts";
import { standing } from "../actions/tree.ts";
import { confirming, dismissConfirm } from "../state.ts";
import { Pane, useScope } from "./Scope.tsx";

/** 危ないアクションの確認 (DR-0003 §2.8)。
 *
 * **アクションの責務は、これを開くまで**。実際に終わらせるのはこの中の決定で、
 * キーから起こしても押す所から起こしても同じ 1 つのアクションを通るので、
 * 確認の出ない経路ができない。
 *
 * 確認は**もう 1 つの区画**でしかない — アクションの中に段階を持たせると、その
 * アクションだけが他と違う形になり、段階の間のキーがどこへ届くかを別に決める
 * ことになる。区画として持てば、フォーカスの追従も後ろの不活化も他と同じ仕組み
 * で済む: `showModal()` が後ろを丸ごと不活にし (`inert` を自分で貼らずに済む)、
 * `Escape` で閉じるのはブラウザの持ち物のまま (閉じる責務は部品のもの、§2.5)。 */

/** 開いた時点でここが立っている区画になる。 */
function StandHere() {
  const scope = useScope();
  useEffect(() => {
    standing.value = scope;
  }, [scope]);
  return null;
}

export function Confirm() {
  const ask = confirming.value;
  const box = useRef<HTMLDialogElement>(null);
  const open = ask !== undefined;
  /** 開く前に立っていた区画。閉じたら宛先はそこへ戻る。 */
  const was = useRef<Scope | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    was.current = standing.peek();
    return () => {
      const back = was.current;
      if (back !== undefined) standing.value = back;
    };
  }, [open]);

  useEffect(() => {
    const at = box.current;
    if (at === null) return;
    if (open && !at.open) at.showModal();
  }, [open]);

  if (ask === undefined) return null;
  const title = actionOf(ask.action)?.title ?? ask.action;
  return (
    <dialog
      class="confirm"
      ref={box}
      onClose={dismissConfirm}
      aria-label={title}
      // 後ろを押しても閉じない。取り返しのつかない操作の前に立っているので、
      // 外した指で消えるのは軽すぎる。
      onCancel={dismissConfirm}
    >
      <Pane name="dialog" label={title} class="confirm-body">
        <StandHere />
        <h2>{title}</h2>
        <p>{ask.note}</p>
        <p class="confirm-actions">
          {/* 既定のボタンは定石の側、つまり取り消す方 (§2.8)。 */}
          <button type="button" autoFocus onClick={dismissConfirm}>
            やめる
          </button>
          <button
            type="button"
            class="row-danger"
            onClick={() => {
              ask.go();
              dismissConfirm();
            }}
          >
            {title}
          </button>
        </p>
      </Pane>
    </dialog>
  );
}
