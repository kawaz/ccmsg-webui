import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";
import { href } from "../base.ts";
import { pagedSideways } from "../layout/panes.ts";
import { statusBadge } from "../llm/status-view.ts";
import type { Route } from "../route.ts";
import {
  askFirst,
  can,
  canGoBack,
  canGoForward,
  endpoint,
  goBack,
  goForward,
  llmStatusReports,
  navigate,
  route,
  sessionsOpen,
  signOut,
  toggleSessionsOpen,
} from "../state.ts";
import { run } from "../actions/tree.ts";
import { Reload } from "./Reload.tsx";
import { Act, useAction, useScope } from "./Scope.tsx";
import { StatusMark } from "./StatusMark.tsx";

/** 接続後の細いツールバー (DR-0004 §2.4)。
 *
 * **帯ではない**。接続前の主役だった住所の入力も接続のボタンもここには無く、
 * 載るのは 5 つだけ — 接続状態の印、戻る、進む、読み込み直し、ハンバーガー。
 * スマホのステータスバーと同じ扱いで、**絵だけ**を並べて題は読み上げと
 * tooltip に出す (横に文字を並べる幅が無い)。住所はフッタに極小で出る
 * (`GlobalFooter`)。
 *
 * 戻る / 進む / 読み込み直しをこの画面が持つのは、**ブラウザの chrome が無い
 * 場面のため** — ホーム画面に追加した PWA や iPad の全画面には戻る手も読み
 * 込み直す手も無く、端末によって在ったり無かったりする道具は当てにならない。
 *
 * 行き先 (アカウント・使用量・設定) と、誤って押されると困るもの (切断)、
 * 一覧の出し入れはハンバーガーの中に畳む。設定へ入れるのは接続後だけ — 繋ぐ前の
 * 人に出す設定は、出した分だけ「繋ぐ」以外の道を増やす (§2.5)。 */

/** 他の画面への道が担当を名乗る所 (DR-0003 付録 A)。
 *
 * 押す所は今も各画面の中に散っている (transcript の footer、端末の「一覧へ」)
 * が、**担当は木の上の 1 か所に集まる** — どこから起こしても同じ所に着き、
 * 行き先を知っている場所が 1 つで済む。
 *
 * 描くものが無いのにコンポーネントなのは、担当を名乗るのがその節の中に居る
 * ことだから (`Shell.tsx` の `PaneMoves` と同じ)。 */
function Ways() {
  const go =
    (to: Route): (() => void) =>
    () => {
      navigate(to);
    };
  useAction("app.open-sessions", { enabled: () => true, run: go({ at: "sessions" }) });
  useAction("app.open-terminals", { enabled: () => true, run: go({ at: "terminals" }) });
  useAction("app.open-settings", { enabled: () => true, run: go({ at: "settings" }) });
  useAction("app.open-usage", {
    // 使用量を聞ける instance が居なければ、開いても書くことが無い。
    enabled: () => can("llm_usage") || can("llm_status"),
    run: go({ at: "usage" }),
  });
  useAction("app.back", { enabled: () => canGoBack.value, run: goBack });
  useAction("app.forward", { enabled: () => canGoForward.value, run: goForward });
  useAction("app.open-parent-session", {
    // 親が居るのは worker を主語に読んでいる時だけ。
    enabled: () => route.value.at === "agent",
    run: () => {
      const at = route.value;
      if (at.at === "agent") navigate({ at: "session", sid: at.sid, tab: "timeline" });
    },
  });
  return null;
}

function Go({
  at,
  action,
  title,
  onGo,
  children,
}: {
  at: Route;
  /** 起こすアクション。省くと、道そのものを持たない入口としてその場で移る。 */
  action?: string;
  title?: string;
  /** 入口を包んでいるもの (メニュー) に、行ったことを知らせる手。 */
  onGo?: () => void;
  children: ComponentChildren;
}) {
  const scope = useScope();
  return (
    <a
      href={href(at)}
      title={title}
      onClick={(event: MouseEvent) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        if (action === undefined) navigate(at);
        else run(action, scope);
        onGo?.();
      }}
    >
      {children}
    </a>
  );
}

/** 一覧の出し入れ。
 *
 * 広い画面では左のペインを畳む / 出す。狭い画面では 2 枚が並んでいないので、
 * これは**一覧へ戻る道**になる (押すと URL が一覧を指し、画面がそちらへ滑る)。 */
function SessionsToggle({ onDone }: { onDone: () => void }) {
  const at = route.value;
  const open = sessionsOpen.value;
  // 並べているかどうかは **CSS が正本** (幅の境目は 1 か所に持つ)。押した瞬間の
  // 形を読むので、hook で覚えた古い値で振る舞いが決まることはない。
  const press = (): void => {
    onDone();
    const panes = document.querySelector(".panes");
    const paged = panes instanceof HTMLElement && pagedSideways(panes);
    if (!paged) {
      toggleSessionsOpen();
      return;
    }
    if (at.at !== "sessions") navigate({ at: "sessions" });
  };
  return (
    <button type="button" class={open ? "on" : undefined} aria-pressed={open} onClick={press}>
      一覧
    </button>
  );
}

/** 使用量の画面への入口と、上流に問題がある時にそこへ添う言葉。
 *
 * ツールバーには絵しか並べられないので、**状態の言葉はこの行に添える** — 正常な
 * 間は何も足さない (いつも出ている知らせは、出ていることが意味を持たなくなる)。
 *
 * 複数の instance から報告が届く mesh では、最も悪いものが出る: 言えるのは
 * 「今いちばん困っていること」だけ。 */
function UsageLink({ onDone }: { onDone: () => void }) {
  const scope = useScope();
  const reports = llmStatusReports.value;
  const worst = reports
    .map((slot) => statusBadge(slot.data))
    .filter((badge) => badge !== undefined)
    .sort((a, b) => (a.tone === "bad" ? -1 : b.tone === "bad" ? 1 : 0))[0];
  if (!can("llm_usage") && !can("llm_status")) return null;
  return (
    <a
      class={worst === undefined ? "usage-link" : `usage-link tone-${worst.tone}`}
      href={href({ at: "usage" })}
      title={worst === undefined ? "使用量とクオータ" : `上流: ${worst.words}`}
      onClick={(event: MouseEvent) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        run("app.open-usage", scope);
        onDone();
      }}
    >
      {worst === undefined ? "使用量" : `使用量 — ${worst.mark} ${worst.words}`}
    </a>
  );
}

/** この端末から降りる (§2.6)。
 *
 * **このシステムは接続 = 認証**なので、画面に出す操作は「切断」1 つ。意味は
 * 向こうに失効を頼み、手元に残っているものを消し、頁を立て直すまでで、席を
 * 外すだけの切り方を別に持たない — 持つと、降りたつもりの人の cookie が残る側と、
 * ちょっと切りたいだけの人が毎回 passkey をやり直す側のどちらかになる。
 *
 * 意図しない切断はこれとは別 (回線が落ちただけなら印が言い、認証が切れていれば
 * 再認証の頼みが重なる、§2.4)。取り返しが付かない側なので、押したら一度確かめる。 */
function Leaving({ onDone }: { onDone: () => void }) {
  const ask = (): void => {
    askFirst({
      action: "app.disconnect",
      note: "instance に失効を頼み、この端末に残っているものを消します。戻るには passkey で認証し直します。",
      go: () => {
        void signOut();
      },
    });
  };
  // キーからも押す所からも同じ 1 つを通るので、確認の出ない経路ができない
  // (DR-0003 §2.1、§2.8)。
  useAction("app.disconnect", { enabled: () => true, run: ask });
  return (
    <button
      type="button"
      class="row-danger"
      onClick={() => {
        onDone();
        ask();
      }}
    >
      切断
    </button>
  );
}

/** ハンバーガーの中。
 *
 * **常時露出させないのは、誤って押されて困るものと、押す機会が稀なものだから**
 * — 降りるは取り返しが付かず、設定とアカウントは開きに行く時にしか要らない。
 * 逆に状態の印・一覧の出し入れ・上流の具合・読み込み直しは残す: どれも「今どう
 * なっているか」を見せているか、見ている最中に何度も押すものになっている。
 *
 * 閉じる手 (Escape・外側のクリック・トップレイヤ) は `popover` が持っているので、
 * `document` の keydown も mousedown もここには要らない (DR-0003 付録 B)。 */
function Menu() {
  const box = useRef<HTMLDivElement>(null);
  const close = (): void => {
    box.current?.hidePopover();
  };
  return (
    <>
      <button
        type="button"
        class="global-menu-open"
        popovertarget="global-menu"
        aria-label="メニュー"
        title="メニュー"
      >
        ☰
      </button>
      <div ref={box} id="global-menu" class="global-menu" popover="auto">
        <SessionsToggle onDone={close} />
        <UsageLink onDone={close} />
        <Go at={{ at: "account" }} title="自分の passkey と、持っている instance" onGo={close}>
          アカウント
        </Go>
        <Go at={{ at: "settings" }} action="app.open-settings" title="設定" onGo={close}>
          設定
        </Go>
        <Leaving onDone={close} />
      </div>
    </>
  );
}

export function GlobalNav() {
  return (
    <nav class="global-nav" aria-label="画面ぜんぶの道">
      <Ways />
      <StatusMark />
      <span class="global-nav-gap" />
      <Act action="app.back" class="nav-icon" icon="←" />
      <Act action="app.forward" class="nav-icon" icon="→" />
      <Reload />
      <Menu />
    </nav>
  );
}

/** 繋いでいる先。**ほとんど気にしない情報**なので、画面の下端に極小で置く。
 *
 * 接続前は人が述べる主役の入力で、接続後は「今どこに繋がっているか」を確かめ
 * たくなった時にだけ読む 1 行になる。述べ直せるのは接続前の画面だけ — 繋いだまま
 * 住所を書き換える所を画面に出しておく理由が無い。 */
export function GlobalFooter() {
  return <p class="global-footer mono">{endpoint.value ?? "(住所がありません)"}</p>;
}
