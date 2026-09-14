import { useRef } from "preact/hooks";
import { sessionsSplitKey } from "../layout/panes.ts";
import { ScrollerContext } from "../layout/scroller.ts";
import {
  dismissToast,
  generationWarning,
  hello,
  navigate,
  route,
  sessionsOpen,
  toast,
} from "../state.ts";
import { ConnectionBar } from "./ConnectionBar.tsx";
import { Stale } from "./Disconnected.tsx";
import { Main } from "./Main.tsx";
import { SessionList } from "./SessionList.tsx";
import { Splitter, useSplitWidth } from "./Splitter.tsx";

/** 繋がっている時の画面の**組み立て**。
 *
 * 持つのは並べ方だけ — 上のバー、画面ぜんぶに掛かる知らせ (通知と世代ずれ)、
 * そして 2 ペイン。何を読むかも、どの画面を出すかも持たない (前者は各画面、
 * 後者は `Main`)。 */
export function Shell() {
  return (
    <>
      <ConnectionBar />
      <Stale />
      <Toast />
      {generationWarning.value !== undefined && (
        <p class="banner">
          {generationWarning.value} — この画面を再読み込みしてください (互換経路はありません)。
        </p>
      )}
      <Panes />
    </>
  );
}

/** 直近の通知。どの画面を見ていても目に入る所に居る。 */
function Toast() {
  const held = toast.value;
  if (held === undefined) return null;
  return (
    <p class="toast">
      <span class="toast-who">{held.notification.sid_label}</span>
      <span class="toast-text">{held.notification.text}</span>
      <button
        type="button"
        onClick={() => {
          const at = held.notification.sid;
          dismissToast();
          navigate({ at: "session", sid: at, tab: "timeline" });
        }}
      >
        開く
      </button>
      <button type="button" onClick={dismissToast}>
        閉じる
      </button>
    </p>
  );
}

/** 一覧と本文の 2 ペイン。
 *
 * 広い画面では左右に並び、境目は掴んで動かせる (`Splitter`)。**本文は残り幅を
 * 全部使う** — 読む幅を画面の側で決めない。
 *
 * **縦は 2 ペインが別々に持つ**。頁ぜんぶを 1 本の scroll にすると、長い方が
 * 短い方の高さを決めてしまう — 一覧が長い日には、本文の「末尾」が本文の終わり
 * ではなく一覧の終わりになる。本文を動かす箱がどれかは `ScrollerContext` が
 * 下へ渡す (`layout/scroller.ts`)。
 *
 * 狭い画面では並べず、URL が名指すものだけを出す: 一覧に居れば一覧、セッション
 * に居れば本文。**2 枚は横に並んだまま**で、切り替えは横へ滑らせるだけなので、
 * 行き先が左右のどちらに居るかが動きに出る。滑りは 90ms — 待たせるための時間で
 * はなく、どちらへ動いたかが見える最短。
 *
 * 持つのは配置と、覚えている幅。中身 (一覧 / 本文) が何であるかは知らない。 */
function Panes() {
  const at = route.value;
  const instance = hello.value?.instance;
  const split = useSplitWidth(instance === undefined ? undefined : sessionsSplitKey(instance));
  const box = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLDivElement>(null);
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
      <div class="pane pane-main" ref={main}>
        <ScrollerContext.Provider value={main}>
          <Main />
        </ScrollerContext.Provider>
      </div>
    </div>
  );
}
