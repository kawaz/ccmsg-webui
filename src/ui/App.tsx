import { generationWarning, navigate, route } from "../state.ts";
import { ConnectionBar } from "./ConnectionBar.tsx";
import { SessionList } from "./SessionList.tsx";

/** The whole page: the connection bar, whatever the URL names, and the one
 * banner that is not about a screen but about the contract itself. */
export function App() {
  const at = route.value;
  return (
    <div class="app">
      <ConnectionBar />
      {generationWarning.value !== undefined && (
        <p class="banner">
          {generationWarning.value} — この画面を再読み込みしてください (互換経路はありません)。
        </p>
      )}
      {at.at === "sessions" && <SessionList />}
      {at.at === "session" && (
        <section class="section">
          <h2>{at.tab}</h2>
          <p class="empty">
            <code>{at.sid}</code> の {at.tab} は未実装です。
          </p>
          <button
            type="button"
            onClick={() => {
              navigate({ at: "sessions" });
            }}
          >
            一覧に戻る
          </button>
        </section>
      )}
      {at.at === "unknown" && (
        <section class="section">
          <h2>404</h2>
          <p class="empty">
            <code>{at.path}</code> は知らない URL です。
          </p>
          <button
            type="button"
            onClick={() => {
              navigate({ at: "sessions" });
            }}
          >
            一覧に戻る
          </button>
        </section>
      )}
    </div>
  );
}
