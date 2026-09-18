import type { Sid } from "@ccmsg/protocol";
import { href } from "../base.ts";
import { type Route, type Tab, visibleTabs } from "../route.ts";
import { runStanding } from "../runs.ts";
import { navigate, peers, route, terminalGateway, terminalIdOfSession } from "../state.ts";
import { Files } from "./Files.tsx";
import { RunChoice, RunEnded, RunPanel, RunSettled } from "./Runs.tsx";
import { Status } from "./Status.tsx";
import { Terminal, Terminals } from "./Terminals.tsx";
import { TerminalPanel } from "./TerminalPanel.tsx";
import { Timeline } from "./Timeline.tsx";
import { Account } from "./Account.tsx";
import { Settings } from "./Settings.tsx";
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
  // 端末があるかは、まず端末の一覧との突き合わせ (契約 DR-0026)。端末管理を
  // 持たない instance では一覧が無いので、run が状態ファイルから知っている値に
  // 落ちる。
  const tabs = visibleTabs(
    terminalGateway.value !== undefined && terminalIdOfSession(sid) !== undefined,
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

/** URL が名指しているのがセッションか、その 1 プロセスか (`src/runs.ts`)。
 *
 * 2 つのプロセスが同じセッションを書いている間は、タブも下書きも出さない —
 * 出しても instance に断られる操作しか無く、人がやることは「どちらを終わらせ
 * るか決める」だけ (契約 DR-0001)。 */
function Session({ at }: { at: Extract<Route, { at: "session" }> }) {
  const { sid, pid, tab } = at;
  const peer = peers.value.find((one) => one.sid === sid);
  const standing = runStanding(peer?.runs ?? [], pid);
  switch (standing.at) {
    case "choose":
      return <RunChoice sid={sid} />;
    case "run":
      return <RunPanel sid={sid} run={standing.run} />;
    case "single":
      return <RunSettled sid={sid} pid={standing.pid} />;
    case "ended":
      return <RunEnded sid={sid} pid={standing.pid} />;
    case "session":
      return (
        <>
          <SessionTabs sid={sid} tab={tab} />
          {tab === "timeline" && <Timeline sid={sid} />}
          {tab === "files" && <Files sid={sid} path={at.path} lines={at.lines} />}
          {tab === "terminal" && <TerminalPanel sid={sid} />}
          {tab === "status" && <Status sid={sid} />}
        </>
      );
  }
}

export function Main() {
  const at = route.value;
  return (
    <>
      {at.at === "sessions" && <Nothing />}
      {at.at === "usage" && <Usage />}
      {at.at === "account" && <Account />}
      {at.at === "settings" && <Settings />}
      {at.at === "terminals" && <Terminals />}
      {at.at === "terminal" && <Terminal id={at.id} />}
      {at.at === "session" && <Session at={at} />}
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
