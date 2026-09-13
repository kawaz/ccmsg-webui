import type { Sid } from "@ccmsg/protocol";
import { needsSignIn } from "../auth/session.ts";
import { href } from "../base.ts";
import { type Tab, visibleTabs } from "../route.ts";
import {
  dismissToast,
  generationWarning,
  hello,
  listed,
  navigate,
  registration,
  route,
  sessionsOpen,
  terminalGateway,
  terminalIds,
  toast,
} from "../state.ts";
import { useRef } from "preact/hooks";
import { sessionsSplitKey } from "../layout/panes.ts";
import { ConnectionBar } from "./ConnectionBar.tsx";
import { Disconnected, Stale } from "./Disconnected.tsx";
import { Files } from "./Files.tsx";
import { Register } from "./Register.tsx";
import { SessionList } from "./SessionList.tsx";
import { SignIn } from "./SignIn.tsx";
import { Splitter, useSplitWidth } from "./Splitter.tsx";
import { Status } from "./Status.tsx";
import { TerminalPanel } from "./TerminalPanel.tsx";
import { Usage } from "./Usage.tsx";
import { Timeline } from "./Timeline.tsx";

/** What each tab is called on screen. The URL keeps the English name — a link
 * is read by whoever it is sent to, and the path is the part they see. */
const TAB_LABELS: Readonly<Record<Tab, string>> = {
  timeline: "transcript",
  files: "ファイル",
  terminal: "端末",
  status: "状態",
};

function SessionTabs({ sid, tab }: { sid: Sid; tab: Tab }) {
  const tabs = visibleTabs(
    terminalGateway.value !== undefined && terminalIds.value.get(sid) !== undefined,
  );
  return (
    <nav class="tabs" aria-label="セッションの見方">
      {tabs.map((one) => (
        <a
          key={one}
          class={one === tab ? "on" : undefined}
          href={href({ at: "session", sid, tab: one })}
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
  // A registration and a sign-in are about who is at this browser, not about
  // what is on screen, so they stand in front of the app rather than beside it:
  // nothing behind them can be read without them.
  if (registration.value !== undefined) {
    return (
      <div class="app">
        <Register />
      </div>
    );
  }
  if (needsSignIn.value) {
    return (
      <div class="app">
        <ConnectionBar />
        <SignIn />
      </div>
    );
  }
  // 一覧も transcript も「instance が今そう言っていること」なので、一度も
  // 聞いていない間は何も描かない。切れただけなら聞いたものは出したまま、
  // 古いことを帯が言う (`Disconnected` を読む)。
  if (!listed.value) {
    return (
      <div class="app">
        <ConnectionBar />
        <Disconnected />
      </div>
    );
  }
  // 一覧は**常に左のペイン**で、URL が名指すものが右に出る。狭い画面ではこの
  // 2 枚が並ばず、URL が「今どちらを見ているか」になる (`Panes` を読む)。
  return (
    <div class="app">
      <ConnectionBar />
      <Stale />
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
      <Panes>
        {at.at === "sessions" && <Main />}
        {at.at === "usage" && <Usage />}
        {at.at === "session" && (
          <>
            <SessionTabs sid={at.sid} tab={at.tab} />
            {at.tab === "timeline" && <Timeline sid={at.sid} />}
            {at.tab === "files" && <Files sid={at.sid} path={at.path} lines={at.lines} />}
            {at.tab === "terminal" && <TerminalPanel sid={at.sid} />}
            {at.tab === "status" && <Status sid={at.sid} />}
          </>
        )}
        {at.at === "agent" && (
          <>
            <nav class="tabs" aria-label="セッションの見方">
              <a
                href={href({ at: "session", sid: at.sid, tab: "timeline" })}
                onClick={(event: MouseEvent) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
                    return;
                  event.preventDefault();
                  navigate({ at: "session", sid: at.sid, tab: "timeline" });
                }}
              >
                ← 親のセッション
              </a>
              <a class="on" aria-current="page" href={href(at)}>
                worker {at.agentId}
              </a>
            </nav>
            <Timeline sid={at.sid} />
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
      </Panes>
    </div>
  );
}

/** 一覧を選んでいる時の右側。
 *
 * 何も選んでいないことを言うだけ — 狭い画面ではそもそもこちらが見えていない
 * (一覧の 1 枚しか出ていない)。 */
function Main() {
  return <p class="empty pane-empty">セッションを選ぶと、ここに出ます。</p>;
}

/** 一覧と本文の 2 ペイン。
 *
 * 広い画面では左右に並び、境目は掴んで動かせる (`Splitter`)。**本文は残り幅を
 * 全部使う** — 読む幅を画面の側で決めない。
 *
 * 狭い画面では並べず、URL が名指すものだけを出す: 一覧に居れば一覧、セッション
 * に居れば本文。**2 枚は横に並んだまま**で、切り替えは横へ滑らせるだけなので、
 * 行き先が左右のどちらに居るかが動きに出る。滑りは 90ms — 待たせるための時間で
 * はなく、どちらへ動いたかが見える最短。 */
function Panes({ children }: { children: preact.ComponentChildren }) {
  const at = route.value;
  const instance = hello.value?.instance;
  const split = useSplitWidth(instance === undefined ? undefined : sessionsSplitKey(instance));
  const box = useRef<HTMLDivElement>(null);
  const open = sessionsOpen.value;
  // 狭い画面でどちらを見ているかは URL が決める。一覧そのものを指している時
  // だけ一覧で、それ以外は本文 (戻る道はバーの「一覧」)。
  const showing = at.at === "sessions" ? "list" : "main";
  return (
    <div
      class={`panes showing-${showing}${open ? "" : " list-off"}`}
      ref={box}
      style={split.width === undefined ? undefined : `--sessions-w:${String(split.width)}px`}
    >
      <div class="pane pane-list">
        <SessionList />
      </div>
      <Splitter
        class="panes-split"
        label="一覧と本文の境目"
        width={split.width}
        measure={() => box.current?.querySelector(".pane-list")?.getBoundingClientRect().width}
        onDrag={(clientX) => {
          const left = box.current?.getBoundingClientRect().left;
          if (left !== undefined) split.hold(clientX - left);
        }}
        onSet={split.hold}
        onSettle={split.keep}
      />
      <div class="pane pane-main">{children}</div>
    </div>
  );
}
