import type { ComponentChildren } from "preact";
import { href } from "../base.ts";
import { statusBadge } from "../llm/status-view.ts";
import type { Route } from "../route.ts";
import {
  askFirst,
  can,
  disconnect,
  endpoint,
  llmStatusReports,
  navigate,
  route,
  sessionsOpen,
  signOut,
  toggleSessionsOpen,
} from "../state.ts";
import { Reload } from "./Reload.tsx";
import { useAction } from "./Scope.tsx";
import { StatusMark } from "./StatusMark.tsx";

/** 接続後の画面の入口たち (DR-0004 §2.4)。
 *
 * **帯ではない**。接続前の主役だった住所の入力も接続のボタンもここには無く、
 * あるのは他の画面への道と、状態の小部品と、常設の読み込み直しだけ。住所は
 * フッタに極小で出る (`GlobalFooter`)。
 *
 * 設定へ入れるのは接続後だけ — 繋ぐ前の人に出す設定は、出した分だけ「繋ぐ」
 * 以外の道を増やす (§2.5)。 */

function Go({ at, title, children }: { at: Route; title?: string; children: ComponentChildren }) {
  return (
    <a
      href={href(at)}
      title={title}
      onClick={(event: MouseEvent) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigate(at);
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
function SessionsToggle() {
  const at = route.value;
  const open = sessionsOpen.value;
  // 並べているかどうかは **CSS が正本** (幅の境目は 1 か所に持つ)。押した瞬間の
  // 形を読むので、hook で覚えた古い値で振る舞いが決まることはない。
  const press = (): void => {
    const panes = document.querySelector(".panes");
    const side = panes === null || getComputedStyle(panes).display !== "grid";
    if (side) {
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

/** 上流に問題がある時だけ出る印と、使用量の画面への入口。
 *
 * 正常は知らせることが無いので何も出さない — いつも出ている印は、出ている
 * ことが意味を持たなくなる。押すと、その印が何のことかを書いてある所へ行く。
 *
 * 複数の instance から報告が届く mesh では、最も悪いものが印になる: 出せるのは
 * 「今いちばん困っていること」だけ。 */
function UsageLink() {
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
        navigate({ at: "usage" });
      }}
    >
      {worst === undefined ? "使用量" : `${worst.mark} ${worst.words}`}
    </a>
  );
}

/** 席を外すのと、この端末から降りるのは別のこと (§2.6)。
 *
 * 切断は socket を閉じるだけで、憶えた住所も refresh cookie も残る — 「接続」を
 * 押せば passkey 無しで戻れる。ログアウトは手元に何も残さず、戻るには passkey
 * からやり直す。取り返しが付かない側なので、押したら一度確かめる。 */
function Leaving() {
  const ask = (): void => {
    askFirst({
      action: "app.sign-out",
      note: "instance に失効を頼み、この端末に残っているものを消します。戻るには passkey で認証し直します。",
      go: () => {
        void signOut();
      },
    });
  };
  // キーからも押す所からも同じ 1 つを通るので、確認の出ない経路ができない
  // (DR-0003 §2.1、§2.8)。
  useAction("app.disconnect", { enabled: () => true, run: disconnect });
  useAction("app.sign-out", { enabled: () => true, run: ask });
  return (
    <>
      <button type="button" onClick={disconnect}>
        切断
      </button>
      <button type="button" onClick={ask}>
        ログアウト
      </button>
    </>
  );
}

export function GlobalNav() {
  return (
    <nav class="global-nav" aria-label="画面ぜんぶの道">
      <StatusMark />
      <SessionsToggle />
      <UsageLink />
      <Go at={{ at: "account" }} title="自分の passkey と、持っている instance">
        アカウント
      </Go>
      <Go at={{ at: "settings" }} title="設定">
        設定
      </Go>
      <Leaving />
      <Reload />
    </nav>
  );
}

/** 繋いでいる先。**ほとんど気にしない情報**なので、画面の下端に極小で置く。
 *
 * 接続前は人が述べる主役の入力で、接続後は「今どこに繋がっているか」を確かめ
 * たくなった時にだけ読む 1 行になる。述べ直したければ切断してから — 繋いだまま
 * 住所を書き換える所を画面に出しておく理由が無い。 */
export function GlobalFooter() {
  return <p class="global-footer mono">{endpoint.value ?? "(住所がありません)"}</p>;
}
