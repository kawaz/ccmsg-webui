import type { ConnectionStatus } from "../connection.ts";
import { status, statusDetail } from "../state.ts";

/** 接続状態を言う小部品 (DR-0004 §2.4)。
 *
 * 接続後の画面が持つのはこれ 1 つで、帯は無い。**言うのは「今どうなっているか」
 * だけ** — instance も契約の版も token の期限も誰として繋がっているかも、ここの
 * 役目ではない (それはアカウントの画面が持つ)。
 *
 * 語ではなく印なのは、接続後の画面で場所を取らないため。語は `title` と読み上げ
 * にだけ出す — 目で読む人には色と形で足り、耳で読む人には印が何も言わない。 */

const MARKS: Readonly<Record<ConnectionStatus, { readonly mark: string; readonly words: string }>> =
  {
    idle: { mark: "○", words: "未接続" },
    connecting: { mark: "◌", words: "接続中" },
    greeting: { mark: "◌", words: "hello 送信中" },
    open: { mark: "●", words: "接続済み" },
    closed: { mark: "◍", words: "切断中" },
  };

export function StatusMark() {
  const state = status.value;
  const said = MARKS[state];
  const detail = statusDetail.value;
  return (
    <span
      class={`status-mark ${state}`}
      title={detail === undefined ? said.words : `${said.words} — ${detail}`}
    >
      <span aria-hidden="true">{said.mark}</span>
      <span class="sr-only">{said.words}</span>
    </span>
  );
}
