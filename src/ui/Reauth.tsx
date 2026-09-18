import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { authProblem } from "../auth/session.ts";
import type { Scope } from "../actions/tree.ts";
import { standing } from "../actions/tree.ts";
import { connect } from "../state.ts";
import { Pane, useScope } from "./Scope.tsx";

/** 認証が切れて繋ぎ直せない、と言う所 (DR-0004 §2.4)。
 *
 * **画面は捨てない**。後ろの workspace は最初から動かず、読んでいたものはそのまま
 * 出ている — 許可が向こうで切れたことは、読んでいたものの価値を変えない。要るのは
 * passkey をもう一度だけで、通ればその場で繋ぎ直る。
 *
 * 常設の読み込み直しより目立つ形にするのは、押すべき所がこちらだから: 読み込み
 * 直しても許可は戻らない。重なるものの作りは確認の器と同じ (DR-0003 の「重なる
 * もの」) — `showModal()` が後ろを丸ごと不活にし、宛先は閉じた時に元の区画へ戻る。
 *
 * **閉じる道は持たない**。閉じても繋がらない画面が残るだけで、そこからもう一度
 * 開く手が要ることになる。人が降りたいなら切断とログアウトが後ろに居る。 */

/** 開いた時点でここが立っている区画になる。 */
function StandHere() {
  const scope = useScope();
  useEffect(() => {
    standing.value = scope;
  }, [scope]);
  return null;
}

export function Reauth() {
  const box = useRef<HTMLDialogElement>(null);
  const working = useSignal(false);
  /** 開く前に立っていた区画。閉じたら宛先はそこへ戻る。 */
  const was = useRef<Scope | undefined>(undefined);

  useEffect(() => {
    was.current = standing.peek();
    return () => {
      const back = was.current;
      if (back !== undefined) standing.value = back;
    };
  }, []);

  useEffect(() => {
    const at = box.current;
    if (at !== null && !at.open) at.showModal();
  }, []);

  return (
    <dialog
      class="confirm reauth"
      ref={box}
      aria-label="passkey で認証し直す"
      // Escape でも後ろを押しても閉じない。閉じた先に進める画面が無い。
      onCancel={(event: Event) => {
        event.preventDefault();
      }}
    >
      <Pane name="dialog" label="passkey で認証し直す" class="confirm-body">
        <StandHere />
        <h2>passkey で認証し直す</h2>
        <p>instance がこの接続を許可しなくなりました。出ている内容は最後に受け取ったものです。</p>
        {authProblem.value !== undefined && <p class="banner">{authProblem.value}</p>}
        <p class="confirm-actions">
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
      </Pane>
    </dialog>
  );
}
