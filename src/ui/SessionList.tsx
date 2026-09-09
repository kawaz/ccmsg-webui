import type { Sid } from "@ccmsg/protocol";
import { DEFAULT_TAB } from "../route.ts";
import { sessionLabel, SORT_KEYS, SORT_LABELS, isSortKey } from "../sessions.ts";
import {
  agents,
  lastLive,
  navigate,
  peers,
  removeLastLive,
  sessionErrors,
  setSortKey,
  sortKey,
  status,
} from "../state.ts";

function open(sid: Sid): void {
  navigate({ at: "session", sid, tab: DEFAULT_TAB });
}

function when(at: number | undefined): string {
  return at === undefined ? "" : new Date(at).toLocaleString();
}

/** The list a person starts from: what is running, what the harness itself
 * reports, and what was running when the instance last looked. */
export function SessionList() {
  const errors = sessionErrors.value;
  const connected = status.value === "open";

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
              <button
                type="button"
                class="row"
                key={peer.sid}
                onClick={() => {
                  open(peer.sid);
                }}
              >
                <span class="name">{sessionLabel(peer)}</span>
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
                <span class="meta mono">{peer.instance}</span>
              </button>
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
            <button
              type="button"
              class="row"
              key={agent.sid}
              onClick={() => {
                open(agent.sid);
              }}
            >
              <span class="name">{sessionLabel({ ...agent, title: agent.name })}</span>
              <span class="state">{agent.kind}</span>
              <span class="meta mono">pid {agent.pid}</span>
            </button>
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
              {row.state !== undefined && <span class="state">{row.state}</span>}
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
