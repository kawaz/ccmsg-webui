import type { Sid } from "@ccmsg/protocol";
import { href } from "../base.ts";
import { type Tab, visibleTabs } from "../route.ts";
import { navigate, route, terminalGateway, terminalIds } from "../state.ts";
import { Files } from "./Files.tsx";
import { Status } from "./Status.tsx";
import { TerminalPanel } from "./TerminalPanel.tsx";
import { Timeline } from "./Timeline.tsx";
import { Usage } from "./Usage.tsx";

/** 右のペインの中身: **URL が名指すもの**。
 *
 * 持つのは「どの URL がどの画面か」だけ。画面が何を読むか (topic / op) は各画面
 * の側にあり、こちらは知らない — 画面を差し替える時に触るのがここ 1 か所で済む。
 * 一覧・バー・境目のことも持たない (それは `Shell` の仕事)。 */

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

export function Main() {
  const at = route.value;
  return (
    <>
      {at.at === "sessions" && <Nothing />}
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
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
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
    </>
  );
}

/** 何も選んでいない時。狭い画面ではそもそもこちらが見えていない (一覧の 1 枚
 * しか出ていない)。 */
function Nothing() {
  return <p class="empty pane-empty">セッションを選ぶと、ここに出ます。</p>;
}
