import { authProblem } from "../auth/session.ts";
import { connect, generationWarning, status, statusDetail, wanted } from "../state.ts";

/** まだ一度も一覧を受け取っていない画面の**本文**。
 *
 * 何も描かない。一覧も transcript も mesh の行も「instance が今そう言っている
 * こと」なので、聞く前に枠だけ描くと空の一覧になり、それは「セッションが 1 つも
 * 無い」であって「繋がっていない」ではない。かといって代わりに説明を置くのも
 * 要らない — 繋がっていないことも、繋ぐ手も、接続バーが既に持っている。押す所を
 * 2 つに増やすと、どちらが本物かを読む人が考えることになる。
 *
 * 例外は**繋ぎ直しても直らないこと**だけ。接続バーには理由を言う場所が無い。
 * 契約の世代の食い違いと、この画面では登録できない登録 URL を開いた時がこれ
 * (後者は、そのまま黙っていると「押したのに何も起きなかった」になる)。 */
export function Disconnected() {
  if (generationWarning.value !== undefined) {
    return (
      <p class="banner">
        {generationWarning.value} — この画面を再読み込みしてください (互換経路はありません)。
      </p>
    );
  }
  if (authProblem.value !== undefined) return <p class="banner">{authProblem.value}</p>;
  return null;
}

/** 聞いたものは出ているが、今は話し相手が居ない、と言う帯。
 *
 * 回線が切れただけの端末から画面まで消さないための形 (`state.ts` の `status`)。
 * 出ているものが**いつのものか**は、行の側には書いていないので、ここで言う。 */
export function Stale() {
  const state = status.value;
  if (state === "open") return null;
  return (
    <p class="stale-band">
      <span>{state === "closed" || state === "idle" ? "切断中" : "接続し直しています…"}</span>
      <span class="meta">表示は最後に受け取った内容です</span>
      {statusDetail.value !== undefined && <span class="meta">{statusDetail.value}</span>}
      {!wanted.value && (
        <button
          type="button"
          onClick={() => {
            void connect();
          }}
        >
          接続
        </button>
      )}
    </p>
  );
}
