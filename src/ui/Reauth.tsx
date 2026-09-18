import { useSignal } from "@preact/signals";
import { authProblem } from "../auth/session.ts";
import { connect, dismissReauth } from "../state.ts";
import { Modal } from "./Modal.tsx";

/** 認証が切れて繋ぎ直せない、と言う所 (DR-0004 §2.4)。
 *
 * **画面は捨てない**。後ろの workspace は最初から動かず、読んでいたものはそのまま
 * 出ている — 許可が向こうで切れたことは、読んでいたものの価値を変えない。要るのは
 * passkey をもう一度だけで、通ればその場で繋ぎ直る。
 *
 * 常設の読み込み直しより目立つ形にするのは、押すべき所がこちらだから: 読み込み
 * 直しても許可は戻らない。
 *
 * **閉じられる**。`stale` は「読むことはできる」姿 (§2.5) なので、重なったものが
 * 閉じられないとその姿が成り立たない — 後ろは不活のままで、切断もログアウトも
 * 読み込み直しも押せなくなる。passkey が通らない端末 (認証器を失った、別の人の
 * 端末、所有を外された) はそこから出る道を持たないことになる。閉じても許可が
 * 切れている事実は下りないので、頼みは状態の印から出し直せる (`StatusMark`)。 */
export function Reauth() {
  const working = useSignal(false);
  return (
    <Modal label="passkey で認証し直す" kind="reauth" onClose={dismissReauth}>
      <p>instance がこの接続を許可しなくなりました。出ている内容は最後に受け取ったものです。</p>
      {authProblem.value !== undefined && <p class="banner">{authProblem.value}</p>}
      <p class="confirm-actions">
        <button type="button" disabled={working.value} onClick={dismissReauth}>
          閉じる
        </button>
        <button
          type="button"
          autoFocus
          disabled={working.value}
          onClick={() => {
            working.value = true;
            void connect().finally(() => {
              working.value = false;
            });
          }}
        >
          {working.value ? "認証中…" : "passkey で認証"}
        </button>
      </p>
    </Modal>
  );
}
