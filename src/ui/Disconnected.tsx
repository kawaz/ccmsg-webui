import { connect, generationWarning, listed, status, statusDetail, wanted } from "../state.ts";

/** まだ一度も一覧を受け取っていない画面。
 *
 * 一覧も transcript も mesh の行も描かない。そこに出るのは全て「instance が今
 * そう言っている」ことなので、聞く前に枠だけ描くと**空の一覧**になり、それは
 * 「セッションが 1 つも無い」であって「繋がっていない」ではない。
 *
 * 出るのは繋がった瞬間ではなく**一覧の snapshot が届いてから** (`listed`)。
 * 開いた直後はまだ何も聞いていないので、そこで出すと一覧が一度空で描かれる。 */
export function Disconnected() {
  const state = status.value;
  const working = wanted.value && state !== "closed";
  return (
    <section class="section">
      <h2>接続していません</h2>
      {generationWarning.value !== undefined && (
        <p class="banner">
          {generationWarning.value} — この画面を再読み込みしてください (互換経路はありません)。
        </p>
      )}
      <p class="empty">
        {working
          ? state === "open" && !listed.value
            ? "instance から一覧を受け取っています…"
            : "instance に繋いでいます…"
          : "この instance に繋ぐと、セッションの一覧が出ます。"}
      </p>
      {statusDetail.value !== undefined && <p class="meta">{statusDetail.value}</p>}
      {!working && (
        <p class="auth-actions">
          <button
            type="button"
            onClick={() => {
              void connect();
            }}
          >
            接続
          </button>
        </p>
      )}
    </section>
  );
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
