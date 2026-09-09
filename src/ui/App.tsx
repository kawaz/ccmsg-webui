import { dismissToast, generationWarning, navigate, route, toast } from "../state.ts";
import { ConnectionBar } from "./ConnectionBar.tsx";
import { SessionList } from "./SessionList.tsx";
import { Timeline } from "./Timeline.tsx";

/** The whole page: the connection bar, whatever the URL names, and the one
 * banner that is not about a screen but about the contract itself. */
export function App() {
  const at = route.value;
  return (
    <div class="app">
      <ConnectionBar />
      {toast.value !== undefined && (
        <p class="toast">
          <span class="toast-who">{toast.value.notification.sid_label}</span>
          <span class="toast-text">{toast.value.notification.text}</span>
          <button
            type="button"
            onClick={() => {
              const at = toast.value?.notification.sid;
              dismissToast();
              if (at !== undefined) navigate({ at: "session", sid: at, tab: "timeline" });
            }}
          >
            開く
          </button>
          <button type="button" onClick={dismissToast}>
            閉じる
          </button>
        </p>
      )}
      {generationWarning.value !== undefined && (
        <p class="banner">
          {generationWarning.value} — この画面を再読み込みしてください (互換経路はありません)。
        </p>
      )}
      {at.at === "sessions" && <SessionList />}
      {at.at === "session" && at.tab === "timeline" && <Timeline sid={at.sid} />}
      {at.at === "session" && at.tab !== "timeline" && (
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
