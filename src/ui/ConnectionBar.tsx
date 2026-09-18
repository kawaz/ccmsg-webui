import { useSignal } from "@preact/signals";
import { connectionExpiresAt, user } from "../auth/session.ts";
import type { ConnectionStatus } from "../connection.ts";
import { instanceLabel } from "../instance-label.ts";
import { statusBadge } from "../llm/status-view.ts";
import { href } from "../base.ts";
import {
  can,
  connect,
  disconnect,
  endpoint,
  hello,
  listed,
  llmStatusReports,
  navigate,
  route,
  sessionsOpen,
  setEndpoint,
  toggleSessionsOpen,
  status,
  statusDetail,
  wanted,
} from "../state.ts";

/** 一覧の出し入れ。
 *
 * 広い画面では左のペインを畳む / 出す。狭い画面では 2 枚が並んでいないので、
 * これは**一覧へ戻る道**になる (押すと URL が一覧を指し、画面がそちらへ滑る)。
 *
 * 一覧の snapshot を聞くまでは出さない (`listed`) — 出し入れする相手がまだ
 * 無いので、押せる所があること自体が「向こうに一覧がある」と嘘をつく。 */
function SessionsToggle() {
  if (!listed.value) return null;
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
    // 並べていない画面では、これは一覧へ戻る道。
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
 * 複数の instance から報告が届く mesh では、最も悪いものが印になる: バーは
 * 1 行なので、そこに出せるのは「今いちばん困っていること」だけ。 */
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

/** 自分の姿へ行く道。
 *
 * 一覧を受け取っている間だけ出る。向こうは instance に聞いて初めて何かが出る
 * 画面なので、繋がっていない時の入口は「押しても空の画面」にしかならない。 */
function AccountLink() {
  if (!listed.value) return null;
  return (
    <a
      href={href({ at: "account" })}
      title="自分の passkey と、持っている instance"
      onClick={(event: MouseEvent) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigate({ at: "account" });
      }}
    >
      アカウント
    </a>
  );
}

/** 設定へ行く道。
 *
 * バーは繋がっていない時も出ているので、この入口も常に居る — 向こうの画面が
 * instance に何も聞かないので、居てよい (DR-0001 §2.6)。 */
function SettingsLink() {
  return (
    <a
      href={href({ at: "settings" })}
      title="設定"
      onClick={(event: MouseEvent) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigate({ at: "settings" });
      }}
    >
      設定
    </a>
  );
}

/** socket が今していることを言う語。
 *
 * まだ何も始めていない時 (`idle`) だけ語が無い — ドットが灰のままであることが
 * それで、隣に「未接続」と書くのは同じことを 2 度言っている。何かをしている
 * 間は、ドットの色だけでは何をしているかまでは言えないので語が要る。 */
const WORDS: Partial<Record<ConnectionStatus, string>> = {
  connecting: "接続中",
  greeting: "hello 送信中",
  open: "接続済み",
  closed: "切断",
};

/** When this connection's authorization runs out, as the clock a person reads.
 *
 * The instant matters more than the countdown: what is renewed happens on its
 * own well before it, and what this is for is telling that the renewal is
 * moving it. */
function untilWords(at: number): string {
  return new Date(at).toLocaleTimeString();
}

/** どの instance に繋ぐか。
 *
 * この画面はどこに publish されていてもよく、繋ぐ先はそれとは別の site で
 * ありうる (契約 DR-0030)。だから住所は**人が述べるもの**で、既定で入って
 * いるのはこのページ自身の住所 — instance が UI ごと配っている置き方では
 * それが正しく、それ以外では出発点にすぎない。
 *
 * 書き換えは離れた時 (or Enter) に確定する。1 文字ごとに確定すると、打って
 * いる途中の URL に繋ぎ変えることになる。受け取れない綴りは**打った文字を
 * 残したまま**断る — 直す相手が消えたら、何を直せばいいのか分からない。 */
function EndpointField() {
  const at = endpoint.value;
  const draft = useSignal<string | undefined>(undefined);
  const refused = useSignal(false);
  const shown = draft.value ?? at ?? "";
  const commit = (): void => {
    const next = draft.value?.trim();
    if (next === undefined || next === at) {
      draft.value = undefined;
      return;
    }
    if (!setEndpoint(next)) {
      refused.value = true;
      draft.value = next;
      return;
    }
    refused.value = false;
    draft.value = undefined;
  };
  return (
    <input
      type="url"
      class="endpoint mono"
      value={shown}
      aria-invalid={refused.value ? "true" : undefined}
      aria-label="instance の endpoint"
      placeholder="https://host/path/"
      title={refused.value ? "末尾が / の http(s) の base URL を入れてください" : undefined}
      onInput={(event) => {
        draft.value = event.currentTarget.value;
        refused.value = false;
      }}
      onBlur={commit}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key === "Enter") (event.currentTarget as HTMLInputElement).blur();
      }}
    />
  );
}

/** What this connection is, in one line.
 *
 * The instance is stated here, because this page is published at an origin of
 * its own and dials an endpoint that may be another site. What
 * is left to do is stop and start it, which is one button: it says the thing
 * pressing it does, and what it is doing now is the word beside the dot. Who is
 * connected is answered by a passkey and shown beside it — as the head of the
 * id, which is what a person has here: the whole of it is sixteen random bytes
 * and names nobody (contract DR-0030 §1), and the name they read themselves by
 * is on the account screen the link beside this one opens. */
export function ConnectionBar() {
  const state = status.value;
  const on = wanted.value;

  return (
    <div class="bar app-bar">
      <span class={`dot ${state === "open" ? "open" : state === "closed" ? "closed" : ""}`} />
      {WORDS[state] !== undefined && <span>{WORDS[state]}</span>}
      <EndpointField />
      <button
        type="button"
        disabled={endpoint.value === undefined}
        onClick={() => {
          if (on) disconnect();
          else void connect();
        }}
      >
        {on ? "切断" : "接続"}
      </button>
      <SessionsToggle />
      <UsageLink />
      <AccountLink />
      <SettingsLink />
      {user.value !== undefined && (
        <span class="meta connection-who" title={user.value}>
          {user.value.slice(0, 8)}
          {connectionExpiresAt.value !== undefined &&
            ` / 期限 ${untilWords(connectionExpiresAt.value)}`}
        </span>
      )}
      {statusDetail.value !== undefined && <span class="meta">{statusDetail.value}</span>}
      {hello.value !== undefined && (
        <span class="footer">
          {instanceLabel(hello.value.instance, hello.value.endpoint)} / daemon {hello.value.version}{" "}
          / 契約世代 {hello.value.protocol_version}
        </span>
      )}
    </div>
  );
}
