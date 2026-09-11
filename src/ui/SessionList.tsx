import { computed } from "@preact/signals";
import type { InstanceInfo, PeerInfo, SessionState, Sid } from "@ccmsg/protocol";
import { DEFAULT_TAB } from "../route.ts";
import { CacheRing } from "./CacheRing.tsx";
import { heldCounts } from "../conversation/held-messages.ts";
import { instanceLabel } from "../instance-label.ts";
import {
  groupPeers,
  isLost,
  sessionLabel,
  SESSION_STATE_LABELS,
  SORT_KEYS,
  SORT_LABELS,
  isSortKey,
} from "../sessions.ts";
import { cacheRingStyle, sessionCacheWindows } from "../llm/cache-ring.ts";
import { terminalUrl } from "../terminal-url.ts";
import {
  agents,
  forgetLostSession,
  heldMessages,
  instances,
  llmRequests,
  navigate,
  peers,
  sessionErrors,
  setSortKey,
  sortKey,
  status,
  terminalGateway,
  terminalIds,
} from "../state.ts";

/** セッションごとの、輪を描く窓。frame は系列ごとに 1 行来るので、行に 1 つを
 * ここで選ぶ。 */
const cacheWindows = computed(() => sessionCacheWindows(llmRequests.value));

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

/** 見出しに立つ名前と、その下に何行あるか。分類を名乗らない instance の行は
 * まとめず、そういう行だということだけを言う。 */
function groupTitle(state: SessionState | undefined, count: number): string {
  return `${state === undefined ? "分類なし" : SESSION_STATE_LABELS[state]} (${String(count)})`;
}

/** セッション 1 行。どう立っているかは instance が言う `state` で、行に付いて
 * いる時刻はその立ち方の内訳 — 失われた行なら最後に見えた時、終了と言って
 * 去った行ならそう言った時。 */
function PeerRow({ peer, waiting }: { peer: PeerInfo; waiting: number }) {
  const failure = sessionErrors.value.get(peer.sid);
  const at = peer.stopped_at ?? peer.last_seen_at;
  // prompt cache が生きている間だけ、名前の前の枠に輪が重なって時計回りに
  // 欠けていく。窓の持ち主は会話の系列なので、どの窓を採るかは
  // `sessionCacheWindows` が決める。入れ物は輪の有無に関わらず常に置く —
  // 条件で包むと行が作り直され、輪が始まるたびに再描画が走る。
  const ring = cacheRingStyle(cacheWindows.value.get(peer.sid), Date.now());
  return (
    <div class="row">
      <span
        class={ring === undefined ? "cache-slot" : `cache-slot ${ring.class}`}
        style={ring?.style}
      >
        {ring !== undefined && <CacheRing />}
      </span>
      <button
        type="button"
        class="name open"
        onClick={() => {
          open(peer.sid);
        }}
      >
        {sessionLabel(peer)}
      </button>
      {waiting > 0 && (
        <span class="held-badge" title="この画面から送って、まだ渡っていない通数">
          {waiting}
        </span>
      )}
      {failure !== undefined && (
        // The error may run to several lines; the row shows the first
        // and the whole of it is on the title.
        <span class="error" title={failure.text}>
          {failure.text.split("\n")[0]}
        </span>
      )}
      <TerminalLink sid={peer.sid} />
      {at !== undefined && <span class="meta">{when(at)}</span>}
      <span class="meta mono">{peer.instance}</span>
      {isLost(peer.state) && (
        <button
          type="button"
          onClick={() => {
            void forgetLostSession(peer.sid);
          }}
        >
          削除
        </button>
      )}
    </div>
  );
}

/** この instance から見た mesh の 1 行。名前は endpoint、届くかどうかはその
 * instance 自身が今言っていること — hello の返事から推し量るのではなく、
 * `instances` topic で届く。 */
function InstanceRow({ one }: { one: InstanceInfo }) {
  return (
    <div class="row">
      <span class="name">
        {one.id === undefined ? (one.endpoint ?? one.host) : instanceLabel(one.id, one.endpoint)}
      </span>
      <span class={`state ${one.reachable ? "live" : "disappeared"}`}>
        {one.reachable ? "到達" : "不通"}
      </span>
      <span class="meta host">{one.host}</span>
      {one.id !== undefined && <span class="meta mono">{one.id}</span>}
    </div>
  );
}

/** The list a person starts from: the sessions every instance knows, grouped by
 * how they stand, what the harness itself reports, and the mesh they sit in. */
export function SessionList() {
  const connected = status.value === "open";
  // この画面から送って、まだ渡っていない数。instance の inbox の件数ではない
  // (人には `inbox` の frame が来ない — `held-messages.ts`)。
  const waiting = heldCounts(heldMessages.value);
  const groups = groupPeers(peers.value);

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

      {groups.length === 0 && (
        <section class="section">
          <h2>セッション (0)</h2>
          <p class="empty">
            {connected ? "セッションはまだありません。" : "接続すると一覧が出ます。"}
          </p>
        </section>
      )}
      {groups.map((group) => (
        <section class="section" key={group.state ?? "ungrouped"}>
          <h2>{groupTitle(group.state, group.rows.length)}</h2>
          <div class="rows">
            {group.rows.map((peer) => (
              <PeerRow key={peer.sid} peer={peer} waiting={waiting.get(peer.sid) ?? 0} />
            ))}
          </div>
        </section>
      ))}

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
        <h2>instance ({instances.value.length})</h2>
        <div class="rows">
          {instances.value.length === 0 && <p class="empty">まだ何も名乗っていません。</p>}
          {instances.value.map((one) => (
            <InstanceRow key={one.id ?? one.endpoint ?? one.host} one={one} />
          ))}
        </div>
      </section>
    </>
  );
}
