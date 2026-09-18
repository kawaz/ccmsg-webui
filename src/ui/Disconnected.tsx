import { authProblem } from "../auth/session.ts";

/** まだ一度も一覧を受け取っていない画面の**本文** (DR-0004 §2.4)。
 *
 * 何も描かない。一覧も transcript も mesh の行も「instance が今そう言っている
 * こと」なので、聞く前に枠だけ描くと空の一覧になり、それは「セッションが 1 つも
 * 無い」であって「繋がっていない」ではない。かといって代わりに説明を置くのも
 * 要らない — 繋がっていないことも、繋ぐ手も、接続バーが既に持っている。押す所を
 * 2 つに増やすと、どちらが本物かを読む人が考えることになる。
 *
 * 出るのは**繋ぎ直しても直らないこと**だけ。この画面では登録できない登録 URL を
 * 開いた時がこれで、黙っていると「押したのに何も起きなかった」になる。契約の
 * 世代の食い違いはここに出ない — それは常設の読み込み直しの色が言う (§2.4)。 */
export function Disconnected() {
  if (authProblem.value === undefined) return null;
  return <p class="banner">{authProblem.value}</p>;
}
