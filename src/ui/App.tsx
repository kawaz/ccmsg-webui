import type { Sid } from "@ccmsg/protocol";
import { routePath, type Tab, TABS } from "../route.ts";
import { dismissToast, generationWarning, navigate, route, toast } from "../state.ts";
import { ConnectionBar } from "./ConnectionBar.tsx";
import { Files } from "./Files.tsx";
import { SessionList } from "./SessionList.tsx";
import { Timeline } from "./Timeline.tsx";

/** What each tab is called on screen. The URL keeps the English name — a link
 * is read by whoever it is sent to, and the path is the part they see. */
const TAB_LABELS: Readonly<Record<Tab, string>> = {
  timeline: "transcript",
  files: "ファイル",
  status: "状態",
  rooms: "部屋",
};

function SessionTabs({ sid, tab }: { sid: Sid; tab: Tab }) {
  return (
    <nav class="tabs" aria-label="セッションの見方">
      {TABS.map((one) => (
        <a
          key={one}
          class={one === tab ? "on" : undefined}
          href={routePath({ at: "session", sid, tab: one })}
          aria-current={one === tab ? "page" : undefined}
          onClick={(event: MouseEvent) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            navigate({ at: "session", sid, tab: one });
          }}
        >
          {TAB_LABELS[one]}
        </a>
      ))}
    </nav>
  );
}

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
      {at.at === "session" && (
        <>
          <SessionTabs sid={at.sid} tab={at.tab} />
          {at.tab === "timeline" && <Timeline sid={at.sid} />}
          {at.tab === "files" && <Files sid={at.sid} path={at.path} lines={at.lines} />}
          {at.tab !== "timeline" && at.tab !== "files" && (
            <section class="section">
              <h2>{TAB_LABELS[at.tab]}</h2>
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
        </>
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
