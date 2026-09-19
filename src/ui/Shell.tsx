import type { RefObject } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { pagedSideways, sessionsSplitKey } from "../layout/panes.ts";
import { sliding as beingSlid, slideTo } from "../layout/slide.ts";
import { ScrollerContext } from "../layout/scroller.ts";
import {
  dismissToast,
  hello,
  listSettled,
  navigate,
  route,
  sessionsOpen,
  toast,
  toggleSessionsOpen,
} from "../state.ts";
import { Confirm } from "./Confirm.tsx";
import { GlobalFooter, GlobalNav } from "./GlobalNav.tsx";
import { Main } from "./Main.tsx";
import { SessionList } from "./SessionList.tsx";
import { Pane, standOn, useAction, useScope } from "./Scope.tsx";
import { Splitter, useSplitWidth } from "./Splitter.tsx";

/** 接続後の画面の**組み立て** (DR-0004 §2.4)。
 *
 * 持つのは並べ方だけ — 上の道 (`GlobalNav`)、直近の通知、2 ペイン、下端の住所。
 * **帯は無い**: 接続状態は道の中の小部品が言い、契約の世代のずれは常設の読み
 * 込み直しの色が言う。何を読むかも、どの画面を出すかも持たない (前者は各画面、
 * 後者は `Main`)。 */
export function Shell() {
  return (
    <>
      <GlobalNav />
      <Toast />
      <Panes />
      <GlobalFooter />
      <Confirm />
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
 * 狭い画面では並べず、**1 枚ずつ窓いっぱいの頁**として横に並べる。隣はチラ見せ
 * しない — 横の並びが言うのは「右へ行くほど深い」だけで、隣がそこに居ることは
 * 目に入らなくてよい。送るのは scroll そのもの (scroll-snap) なので、**指で右へ
 * 送れば一覧へ戻れる**。送り終わった所は URL にも書く: 画面が一覧に居るのに URL が
 * セッションを名指していると、ブラウザの戻る (iOS の端スワイプを含む) と食い
 * 違う。
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
  // だけ一覧で、それ以外は本文。
  const showing = at.at === "sessions" ? "list" : "main";
  useSlidingPages(box, main, showing);
  return (
    <Pane
      name="workspace"
      label="作業画面"
      hold={box}
      class={`panes showing-${showing}${open ? "" : " list-off"}`}
      style={split.width === undefined ? undefined : `--sessions-w:${String(split.width)}px`}
    >
      <PaneMoves />
      <Pane
        name="session-list"
        label="セッションの一覧"
        class="pane pane-list"
        settled={listSettled.value}
      >
        <SessionList />
      </Pane>
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
      <Pane name="main" label="メインコンテンツ" hold={main} class="pane pane-main">
        <ScrollerContext.Provider value={main}>
          <Main />
        </ScrollerContext.Provider>
      </Pane>
    </Pane>
  );
}

/** 狭い画面の頁送りと、送り終わった所を URL に書くこと (DR-0004 §2.4)。
 *
 * **URL → 画面**は送ることで、**画面 → URL** は送り終わりを聞いて書く。後者を
 * 置かないと、指で一覧へ戻った後も URL はセッションを名指したままになり、
 * ブラウザの戻る (iOS の端スワイプを含む) が人の見ている所と食い違う。
 *
 * 送り終わりは `scrollend` が言う。指を離した後にどこへ収まるかを決めるのは
 * scroll-snap なので、途中を見張っても答えは出ない (見張る必要も無い)。 */
function useSlidingPages(
  box: RefObject<HTMLDivElement>,
  main: RefObject<HTMLDivElement>,
  showing: "list" | "main",
): void {
  // URL が名指す頁へ送る。広い画面では 2 枚が並んでいるので送る所が無い。
  useEffect(() => {
    const at = box.current;
    const to = main.current;
    if (at === null || to === null || !pagedSideways(at)) return;
    slideTo(at, showing === "main" ? to.offsetLeft - at.offsetLeft : 0);
  }, [box, main, showing]);

  // 送り終わった所を URL に書く。一覧へ戻った時だけで、逆 (本文へ送った時に
  // どのセッションを開くか) はこちらからは言えない — 開く相手を選ぶのは人。
  useEffect(() => {
    const at = box.current;
    if (at === null) return;
    const settled = (): void => {
      // こちらが送っている最中の `scrollend` は「着いた所」を言っていない。
      if (beingSlid(at)) return;
      if (!pagedSideways(at)) return;
      if (at.scrollLeft > at.clientWidth / 2) return;
      if (route.peek().at === "sessions") return;
      navigate({ at: "sessions" });
    };
    at.addEventListener("scrollend", settled);
    return () => {
      at.removeEventListener("scrollend", settled);
    };
  }, [box]);
}

/** 区画をまたぐ移動 (DR-0003 §2.7)。
 *
 * **押す所を持たない** — 押す所を作ると、押した時点でそこがフォーカスを持って
 * しまい、目的の「手を離さず辿る」が消える (§2.4)。既定の割り当ても無いので、
 * 欲しい人が設定で綴りを結ぶ (§2.5)。
 *
 * 描くものが無いのにコンポーネントなのは、担当を名乗るのが**その節の中に居る
 * こと**だから — workspace の担当は workspace の中で名乗る。 */
function PaneMoves() {
  const scope = useScope();
  const go = (name: string): void => {
    const to = scope.child(name);
    if (to !== undefined) standOn(to);
  };
  useAction("workspace.focus-sidebar", {
    // 出ていない区画へは移れない。移れてしまうと、キーの当たる先が画面から
    // 消えたままになる。
    enabled: () => sessionsOpen.value && scope.child("session-list") !== undefined,
    run: () => {
      go("session-list");
    },
  });
  useAction("workspace.focus-main", {
    enabled: () => scope.child("main") !== undefined,
    run: () => {
      go("main");
    },
  });
  useAction("workspace.toggle-sidebar", {
    enabled: () => true,
    run: toggleSessionsOpen,
  });
  return null;
}
