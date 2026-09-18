import { actionOf } from "../actions/catalogue.ts";
import { confirming, dismissConfirm } from "../state.ts";
import { Modal } from "./Modal.tsx";

/** 危ないアクションの確認 (DR-0003 §2.8)。
 *
 * **アクションの責務は、これを開くまで**。実際に終わらせるのはこの中の決定で、
 * キーから起こしても押す所から起こしても同じ 1 つのアクションを通るので、
 * 確認の出ない経路ができない。
 *
 * 重なりの器そのものは `Modal` が持つ — 確認も再認証も、違うのは中身と閉じた時に
 * することだけ。 */
export function Confirm() {
  const ask = confirming.value;
  if (ask === undefined) return null;
  const title = actionOf(ask.action)?.title ?? ask.action;
  return (
    <Modal label={title} onClose={dismissConfirm}>
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
    </Modal>
  );
}
