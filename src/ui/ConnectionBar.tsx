import { connectionExpiresAt, subject } from "../auth/session.ts";
import { instanceLabel } from "../instance-label.ts";
import { statusBadge } from "../llm/status-view.ts";
import { href } from "../base.ts";
import {
  can,
  connect,
  disconnect,
  endpoint,
  hello,
  llmStatusReports,
  navigate,
  route,
  sessionsOpen,
  toggleSessionsOpen,
  status,
  statusDetail,
  wanted,
} from "../state.ts";

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

const WORDS: Record<string, string> = {
  idle: "未接続",
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

/** What this connection is, in one line.
 *
 * The instance is not chosen here: this page is served from under its endpoint,
 * so the address is shown rather than typed (DR-0001 §2.2). What is left to do
 * is stop and start it, which is one button: it says the thing pressing it
 * does, and what it is doing now is the word beside the dot. Who is connected
 * is answered by a passkey and shown beside it. */
export function ConnectionBar() {
  const state = status.value;
  const on = wanted.value;

  return (
    <div class="bar app-bar">
      <span class={`dot ${state === "open" ? "open" : state === "closed" ? "closed" : ""}`} />
      <span>{WORDS[state] ?? state}</span>
      <code class="endpoint">{endpoint}</code>
      <button
        type="button"
        disabled={endpoint === undefined}
        onClick={() => {
          if (on) disconnect();
          else void connect();
        }}
      >
        {on ? "切断" : "接続"}
      </button>
      <SessionsToggle />
      <UsageLink />
      {subject.value !== undefined && (
        <span class="meta">
          {subject.value}
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
