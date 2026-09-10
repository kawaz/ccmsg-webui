import type { Sid } from "@ccmsg/protocol";
import { DEFAULT_TAB } from "../route.ts";
import { heldCounts } from "../conversation/held-messages.ts";
import { sessionLabel, SORT_KEYS, SORT_LABELS, isSortKey } from "../sessions.ts";
import { terminalUrl } from "../terminal-url.ts";
import {
  agents,
  heldMessages,
  lastLive,
  navigate,
  peers,
  removeLastLive,
  sessionErrors,
  setSortKey,
  sortKey,
  status,
  terminalGateway,
  terminalIds,
} from "../state.ts";

function open(sid: Sid): void {
  navigate({ at: "session", sid, tab: DEFAULT_TAB });
}

function when(at: number | undefined): string {
  return at === undefined ? "" : new Date(at).toLocaleString();
}

/** 行から、そのセッションが動いている端末へ。gateway 側の画面をそのまま開く
 * ので、この画面ではなく新しいタブに出す — 一覧を見失わずに端末を覗ける。
 * 端末に届かない行には何も出さない。 */
function TerminalLink({ sid }: { sid: Sid }) {
  const url = terminalUrl(terminalGateway.value, terminalIds.value.get(sid));
  if (url === null) return null;
  return (
    <a class="terminal-link" href={url} target="_blank" rel="noreferrer" title="端末を開く">
      端末
    </a>
  );
}

/** The list a person starts from: what is running, what the harness itself
 * reports, and what was running when the instance last looked. */
export function SessionList() {
  const errors = sessionErrors.value;
  const connected = status.value === "open";
  // この画面から送って、まだ渡っていない数。instance の inbox の件数ではない
  // (人には `inbox` の frame が来ない — `held-messages.ts`)。
  const waiting = heldCounts(heldMessages.value);

  return (
    <>
      <div class="bar">
        <label for="sort">並び</label>
        <select
          id="sort"
          value={sortKey.value}
          onChange={(event) => {
            const picked = event.currentTarget.value;
            if (isSortKey(picked)) setSortKey(picked);
          }}
        >
          {SORT_KEYS.map((key) => (
            <option key={key} value={key}>
              {SORT_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      <section class="section">
        <h2>稼働セッション ({peers.value.length})</h2>
        <div class="rows">
          {peers.value.length === 0 && (
            <p class="empty">
              {connected ? "接続中のセッションはありません。" : "接続すると一覧が出ます。"}
            </p>
          )}
          {peers.value.map((peer) => {
            const failure = errors.get(peer.sid);
            return (
              <div class="row" key={peer.sid}>
                <button
                  type="button"
                  class="name open"
                  onClick={() => {
                    open(peer.sid);
                  }}
                >
                  {sessionLabel(peer)}
                </button>
                {(waiting.get(peer.sid) ?? 0) > 0 && (
                  <span class="held-badge" title="この画面から送って、まだ渡っていない通数">
                    {waiting.get(peer.sid)}
                  </span>
                )}
                {failure !== undefined && (
                  // The error may run to several lines; the row shows the first
                  // and the whole of it is on the title.
                  <span class="error" title={failure.text}>
                    {failure.text.split("\n")[0]}
                  </span>
                )}
                {peer.state !== undefined && (
                  <span class={`state ${peer.state}`}>{peer.state}</span>
                )}
                <TerminalLink sid={peer.sid} />
                <span class="meta mono">{peer.instance}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section class="section">
        <h2>agents ({agents.value.length})</h2>
        <div class="rows">
          {agents.value.length === 0 && (
            <p class="empty">ハーネス側の追加セッションはありません。</p>
          )}
          {agents.value.map((agent) => (
            <div class="row" key={agent.sid}>
              <button
                type="button"
                class="name open"
                onClick={() => {
                  open(agent.sid);
                }}
              >
                {sessionLabel({ ...agent, title: agent.name })}
              </button>
              <span class="state">{agent.kind}</span>
              <TerminalLink sid={agent.sid} />
              <span class="meta mono">pid {agent.pid}</span>
            </div>
          ))}
        </div>
      </section>

      <section class="section">
        <h2>前回稼働 ({lastLive.value.length})</h2>
        <div class="rows">
          {lastLive.value.length === 0 && (
            <p class="empty">記録されているセッションはありません。</p>
          )}
          {lastLive.value.map((row) => (
            <div class="row" key={row.sid}>
              <span class="name">{sessionLabel(row)}</span>
              {(waiting.get(row.sid) ?? 0) > 0 && (
                <span class="held-badge" title="この画面から送って、まだ渡っていない通数">
                  {waiting.get(row.sid)}
                </span>
              )}
              {row.state !== undefined && <span class="state">{row.state}</span>}
              <TerminalLink sid={row.sid} />
              <span class="meta">{when(row.last_seen_at)}</span>
              <button
                type="button"
                onClick={() => {
                  void removeLastLive(row.sid);
                }}
              >
                削除
              </button>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
