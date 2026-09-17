import { computed, useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import {
  liveness,
  type AgentInfo,
  type InstanceInfo,
  type PeerInfo,
  type Sid,
  type TerminalInfo,
} from "@ccmsg/protocol";
import { href } from "../base.ts";
import { DEFAULT_TAB } from "../route.ts";
import { CacheRing } from "./CacheRing.tsx";
import { Launcher } from "./Launcher.tsx";
import { SessionSearch } from "./SessionSearch.tsx";
import { instanceLabel } from "../instance-label.ts";
import {
  groupPeers,
  isLost,
  sessionLabel,
  type SessionSection,
  listStanding,
  SESSION_SECTION_LABELS,
  SORT_KEYS,
  SORT_LABELS,
  isSortKey,
} from "../sessions.ts";
import { listUnits, stepCursor, unitAt, unitKey } from "../sessions-cursor.ts";
import { cacheRingStyle, sessionCacheWindows } from "../llm/cache-ring.ts";
import { describeRefusal } from "../refusal.ts";
import { terminalUrl } from "../terminal-url.ts";
import {
  agents,
  answering,
  askFirst,
  forgetLostSession,
  instances,
  can,
  killSession,
  listCollapsed,
  listCursor,
  listFilter,
  listFilterOpen,
  listSettled,
  launcherOpen,
  llmRequests,
  markUnkilled,
  navigate,
  peers,
  pinned,
  waitingBySid,
  renameSession,
  renaming,
  togglePinned,
  toggleListSection,
  sessionErrors,
  setSortKey,
  sortKey,
  startingRuns,
  status,
  terminalGateway,
  terminalIdOfSession,
  unkilled,
} from "../state.ts";
import { Act, Holder, standOn, useAction, useScope, useScopeKeys } from "./Scope.tsx";
import { terminalLabel } from "../terminals.ts";

/** セッションごとの、輪を描く窓。frame は系列ごとに 1 行来るので、行に 1 つを
 * ここで選ぶ。 */
const cacheWindows = computed(() => sessionCacheWindows(llmRequests.value));

function open(sid: Sid): void {
  navigate({ at: "session", sid, tab: DEFAULT_TAB });
}

function when(at: number | undefined): string {
  return at === undefined ? "" : new Date(at).toLocaleString();
}

/** 行から、その run が動いている端末へ。gateway 側の画面をそのまま開くので、
 * この画面ではなく新しいタブに出す — 一覧を見失わずに端末を覗ける。端末に
 * 届かない行には何も出さない。 */
function TerminalLink({ terminalId }: { terminalId: string | undefined }) {
  const url = terminalUrl(terminalGateway.value, terminalId);
  if (url === undefined) return null;
  return (
    <a class="terminal-link" href={url} target="_blank" rel="noreferrer" title="端末を開く">
      端末
    </a>
  );
}

/** 見出しに立つ名前と、その下に何行あるか。 */
function groupTitle(section: SessionSection, count: number): string {
  return `${SESSION_SECTION_LABELS[section]} (${String(count)})`;
}

/** セッション 1 つに効くアクションの担当。
 *
 * **同じ組を 2 か所が名乗る** (DR-0003 §2.3): 行の中では自分の行を対象に、区画の
 * 上ではカーソルの行を対象に。押す所は行の中に居るので内側 (= その行) に当たり、
 * 打鍵は区画から登るのでカーソルの行に当たる — 押した所とキーで別の行が対象に
 * なることがない。
 *
 * 終了・強制終了・削除は `destructive` の印付き。呼ばれたら確認を開くまでが
 * 責務で (§2.8)、段階を行が持つことはもう無い。 */
function useSessionActions(peerOf: () => PeerInfo | undefined) {
  const ask = (action: string, note: string, go: () => void): void => {
    askFirst({ action, note, go });
  };
  useAction("session-list.pin", {
    enabled: () => peerOf() !== undefined,
    run: () => {
      const peer = peerOf();
      if (peer !== undefined) togglePinned(peer.sid);
    },
  });
  useAction("session-list.rename", {
    // 改名は端末に打鍵を送ってもらう操作なので、端末を持つ instance でだけ。
    enabled: () => peerOf() !== undefined && can("terminal"),
    run: () => {
      renaming.value = peerOf()?.sid;
    },
  });
  useAction("session-list.kill", {
    enabled: () => peerOf() !== undefined,
    run: () => {
      const sid = peerOf()?.sid;
      if (sid === undefined) return;
      ask(
        "session-list.kill",
        "このセッションに終了を頼みます。消えなかった時だけ、強い方を選べるようになります。",
        () => {
          killSession(sid, false)
            .then((said) => {
              // 消えなかったのは失敗ではなく、次に何を選ぶかの材料 (契約)。
              markUnkilled(sid, !said.terminated);
            })
            .catch(() => {
              markUnkilled(sid, false);
            });
        },
      );
    },
  });
  useAction("session-list.kill-force", {
    // 強い方は**人が 1 度普通に頼んでから**選ぶもの (契約)。
    enabled: () => {
      const peer = peerOf();
      return peer !== undefined && unkilled.value.has(peer.sid);
    },
    run: () => {
      const sid = peerOf()?.sid;
      if (sid === undefined) return;
      ask(
        "session-list.kill-force",
        "強い方は transcript を書き切る機会ごと奪います。書きかけの行は残りません。",
        () => {
          killSession(sid, true)
            .then((said) => {
              markUnkilled(sid, !said.terminated);
            })
            .catch(() => {
              /* 断られたことは行のままで分かる (次の snapshot が来る)。 */
            });
        },
      );
    },
  });
  useAction("session-list.forget", {
    enabled: () => {
      const peer = peerOf();
      return peer !== undefined && isLost(peer, Date.now());
    },
    run: () => {
      const sid = peerOf()?.sid;
      if (sid === undefined) return;
      ask("session-list.forget", "instance がこのセッションを忘れます。一覧から消えます。", () => {
        void forgetLostSession(sid);
      });
    },
  });
}

/** 行の中の押す所。押す所は**アクションを起こす 1 行**で、することの中身は
 * アクションの側にある (§2.4)。 */
function RowActions({ peer }: { peer: PeerInfo }) {
  const draft = useSignal("");
  const problem = useSignal<string | undefined>(undefined);
  const held = pinned.value.has(peer.sid);
  const stuck = unkilled.value.has(peer.sid);
  useSessionActions(() => peer);

  const rename = (): void => {
    const title = draft.value.trim();
    renaming.value = undefined;
    if (title === "") return;
    renameSession(peer.sid, title).catch((cause: unknown) => {
      problem.value = describeRefusal(cause);
    });
  };

  if (renaming.value === peer.sid) {
    return (
      <input
        class="row-rename"
        type="text"
        autoFocus
        value={draft.value === "" ? sessionLabel(peer) : draft.value}
        aria-label="新しい名前"
        onInput={(event) => {
          draft.value = event.currentTarget.value;
        }}
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key === "Enter") rename();
          if (event.key === "Escape") renaming.value = undefined;
        }}
        onBlur={rename}
      />
    );
  }
  return (
    <>
      <Act
        action="session-list.pin"
        class="row-pin"
        title={held ? "留めるのをやめる" : "一覧の先頭に留める"}
      >
        {held ? "★" : "☆"}
      </Act>
      {can("terminal") && <Act action="session-list.rename">改名</Act>}
      <Act action="session-list.kill">終了</Act>
      {stuck && (
        <Act
          action="session-list.kill-force"
          class="row-danger"
          title="普通に頼んでも消えなかった。強い方は transcript を書き切る機会を奪う"
        >
          消えない — 強制終了
        </Act>
      )}
      {problem.value !== undefined && <span class="meta">{problem.value}</span>}
    </>
  );
}

function PeerRow({
  peer,
  section,
  waiting,
  now,
  onCursor,
}: {
  peer: PeerInfo;
  section: SessionSection;
  waiting: number;
  now: number;
  onCursor: boolean;
}) {
  const failure = sessionErrors.value.get(peer.sid);
  const at = peer.stopped_at ?? peer.last_seen_at;
  // 2 つのプロセスが書いている行では、行の上の操作を出さない — 送るも改名も
  // 終了も instance に断られる (契約 DR-0001)。代わりに、どちらを終わらせるかを
  // 選ぶ画面へ渡す。
  const twofold = liveness(peer, now) === "duplicated";
  const standingRow = listStanding(peer.session_status);
  // prompt cache が生きている間だけ、名前の前の枠に輪が重なって時計回りに
  // 欠けていく。窓の持ち主は会話の系列なので、どの窓を採るかは
  // `sessionCacheWindows` が決める。入れ物は輪の有無に関わらず常に置く —
  // 条件で包むと行が作り直され、輪が始まるたびに再描画が走る。
  const ring = cacheRingStyle(cacheWindows.value.get(peer.sid), Date.now());
  const box = useRef<HTMLDivElement>(null);
  // カーソルの行は画面の中に居る。キーで辿った先が窓の外だと、辿っている手が
  // 何も動いていないように見える。
  useEffect(() => {
    if (onCursor) box.current?.scrollIntoView({ block: "nearest" });
  }, [onCursor]);
  return (
    <Holder name={`row ${peer.sid}`}>
      <div class={`row${onCursor ? " on-cursor" : ""}`} ref={box}>
        <span
          class={ring === undefined ? "cache-slot" : `cache-slot ${ring.class}`}
          style={ring?.style}
        >
          {ring !== undefined && <CacheRing />}
        </span>
        <button
          type="button"
          class="name open"
          // roving tabindex: 節の中で tab が届くのはカーソルの行だけ。一覧の行数
          // だけ tab を押させない。
          tabIndex={onCursor ? 0 : -1}
          onClick={() => {
            // 押した行がカーソルの行になる。行に効く操作の対象がカーソルの行
            // である以上、押した所とキーで別の行を指してはならない。
            listCursor.value = unitKey({ at: "session", section, sid: peer.sid });
            open(peer.sid);
          }}
        >
          {sessionLabel(peer)}
        </button>
        {/* 待っている通数は**入れ物ごと常に置く**。0 通の間も場所を取るので、
          1 通届いた / 渡ったの瞬間に行が組み直されない — 輪の入れ物
          (`.cache-slot`) と同じ理由で、数が出たり消えたりするものは席を
          先に取っておく。 */}
        <span class="waiting-slot">
          {waiting > 0 && (
            <span class="waiting-badge" title="このセッションの inbox で待っている通数">
              {waiting}
            </span>
          )}
        </span>
        {failure !== undefined && (
          // The error may run to several lines; the row shows the first
          // and the whole of it is on the title.
          <span class="error" title={failure.text}>
            {failure.text.split("\n")[0]}
          </span>
        )}
        {standingRow !== undefined && (
          <span class="state" title="このセッションの状態の畳みが今どうなっているか">
            {standingRow}
          </span>
        )}
        {!twofold && <TerminalLink terminalId={terminalIdOfSession(peer.sid)} />}
        {twofold ? (
          <button
            type="button"
            class="row-danger"
            onClick={() => {
              open(peer.sid);
            }}
          >
            run を選ぶ
          </button>
        ) : (
          <RowActions peer={peer} />
        )}
        {at !== undefined && <span class="meta">{when(at)}</span>}
        <span class="meta mono">{peer.instance}</span>
        {isLost(peer, now) && <Act action="session-list.forget">削除</Act>}
      </div>
    </Holder>
  );
}

/** ハーネス側の 1 プロセス。**セッションを名乗る前のものもここに出る** —
 * launcher が起動しただけで、ハーネスがまだ状態ファイルを書いていない窓では、
 * 端末と起動時刻しか無い (契約 DR-0001 §4)。開く先が無いので名前は押せず、
 * 覗きに行く手として端末だけを出す。 */
function AgentRow({ agent }: { agent: AgentInfo }) {
  const sid = agent.sid;
  return (
    <div class="row">
      {sid === undefined ? (
        <span class="name">{sessionLabel({ ...agent, title: agent.name })}</span>
      ) : (
        <button
          type="button"
          class="name open"
          onClick={() => {
            open(sid);
          }}
        >
          {sessionLabel({ ...agent, title: agent.name })}
        </button>
      )}
      <span class="state">{sid === undefined ? "起動中" : agent.kind}</span>
      <TerminalLink terminalId={agent.terminal_id} />
      <span class="meta mono">pid {agent.pid}</span>
    </div>
  );
}

/** 起動したのに、まだ何も名乗っていないハーネスの 1 行 (契約 DR-0026 の
 * `starting`)。
 *
 * sid がまだ無いので開く先も無く、名乗れるのは端末の id だけ。**様子は端末の中
 * にしかない**ので、行が案内するのは端末だけにする — 押すとこの build の端末の
 * 画面へ行き、`端末` は gateway の画面をそのまま開く。 */
function StartingRow({ row }: { row: TerminalInfo }) {
  return (
    <div class="row">
      <a
        class="name"
        href={href({ at: "terminal", id: row.id })}
        onClick={(event: MouseEvent) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          navigate({ at: "terminal", id: row.id });
        }}
      >
        {terminalLabel(row)}
      </a>
      <span class="state">起動中</span>
      <TerminalLink terminalId={row.id} />
      {row.pid !== undefined && <span class="meta mono run-pid">pid {row.pid}</span>}
      <span class="meta mono">{row.id}</span>
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

/** 今並んでいるものを絞る窓 (`/`)。
 *
 * **一覧に無いものは取りに行かない** — それは別のアクション (`SessionSearch`)
 * で、聞いている先が違う (DR-0003 §2.2)。 */
function QuickFilter() {
  const box = useRef<HTMLInputElement>(null);
  const on = listFilterOpen.value;
  useEffect(() => {
    if (on) box.current?.focus();
  }, [on]);
  if (!on && listFilter.value === "") return null;
  return (
    <p class="list-filter">
      <input
        ref={box}
        type="search"
        class="list-filter-input"
        value={listFilter.value}
        aria-label="今並んでいるものを絞る"
        placeholder="名前で絞る"
        onInput={(event) => {
          listFilter.value = event.currentTarget.value;
        }}
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key !== "Escape") return;
          listFilter.value = "";
          listFilterOpen.value = false;
        }}
      />
      <button
        type="button"
        aria-label="絞り込みをやめる"
        onClick={() => {
          listFilter.value = "";
          listFilterOpen.value = false;
        }}
      >
        ✕
      </button>
    </p>
  );
}

/** 一覧が担当するアクションと、区画の役としての打鍵。
 *
 * 描くものが無いのにコンポーネントなのは、担当を名乗るのがこの節の中に居ること
 * だから。上下はカーソルを動かすだけで、開くのは決定の時 (§2.2)。 */
function ListActions({
  units,
  cursorPeer,
  onFilter,
}: {
  units: readonly ReturnType<typeof listUnits>[number][];
  cursorPeer: PeerInfo | undefined;
  onFilter: () => void;
}) {
  const scope = useScope();
  // 区画の上では、行に効くアクションの対象は**カーソルの行**。行の中の同じ
  // アクション (その行が対象) は内側に居るので、押す所には行の方が当たる。
  useSessionActions(() => cursorPeer);
  const here = (): ReturnType<typeof unitAt> => unitAt(units, listCursor.value);
  const move = (step: 1 | -1): void => {
    const to = stepCursor(units, listCursor.value, step);
    if (to !== undefined) listCursor.value = to;
  };
  const toMain = (): void => {
    const main = scope.parent?.child("main");
    if (main !== undefined) standOn(main);
  };
  useAction("session-list.select-prev", {
    enabled: () => units.length > 0,
    run: () => {
      move(-1);
    },
  });
  useAction("session-list.select-next", {
    enabled: () => units.length > 0,
    run: () => {
      move(1);
    },
  });
  useAction("session-list.collapse", {
    // セッションの上ではそのセクションの見出しへ戻る。見出しの上で押せば畳む —
    // 同じ ← が「1 つ外へ」の 1 語のまま、木を上がる形になる。
    enabled: () => {
      const at = here();
      if (at === undefined) return false;
      return at.at === "session" || !listCollapsed.value.has(at.section);
    },
    run: () => {
      const at = here();
      if (at === undefined) return;
      if (at.at === "session") {
        listCursor.value = unitKey({ at: "section", section: at.section });
        return;
      }
      toggleListSection(at.section, true);
    },
  });
  useAction("session-list.expand", {
    enabled: () => here() !== undefined,
    run: () => {
      const at = here();
      if (at === undefined) return;
      // セクションなら開き、セッションの上なら tl 本体へ移る (§2.2)。
      if (at.at === "section") {
        toggleListSection(at.section, false);
        return;
      }
      open(at.sid);
      toMain();
    },
  });
  useAction("session-list.open", {
    enabled: () => here()?.at === "session",
    run: () => {
      const at = here();
      if (at?.at !== "session") return;
      open(at.sid);
      toMain();
    },
  });
  useAction("session-list.new", {
    // 始められる instance でだけ。献立を持っていない所では入口ごと無い。
    enabled: () => can("launcher"),
    run: () => {
      launcherOpen.value = true;
    },
  });
  useAction("session-list.open-search", {
    enabled: () => true,
    run: onFilter,
  });
  // 区画の役としての打鍵 (§2.2 の表)。PageUp / PageDown は区画のスクロールで、
  // 区画そのものが focus を持っているのでブラウザの既定がそのまま効く。
  useScopeKeys({
    ArrowUp: "session-list.select-prev",
    ArrowDown: "session-list.select-next",
    ArrowLeft: "session-list.collapse",
    ArrowRight: "session-list.expand",
    Enter: "session-list.open",
    Space: "session-list.open",
    Slash: "session-list.open-search",
  });
  return null;
}

/** The list a person starts from: the sessions every instance knows, grouped by
 * how they stand, what the harness itself reports, and the mesh they sit in. */
export function SessionList() {
  const connected = status.value === "open";
  // そのセッションの inbox で待っている通数。誰が言った分も入る — 人が
  // 眺めているのは instance の inbox そのもので、この画面の控えではない。
  const waiting = waitingBySid.value;
  // 行がどこに立つかは、行の中身と**今**から決まる (契約の `liveness`)。1 度の
  // 描画の中では同じ今を使う — 行ごとに読み直すと、見出しと行が別の瞬間の話に
  // なりうる。
  const now = Date.now();
  const word = listFilter.value.trim().toLowerCase();
  const shown =
    word === ""
      ? peers.value
      : peers.value.filter((peer) => sessionLabel(peer).toLowerCase().includes(word));
  const groups = groupPeers(shown, answering.value, now);
  const collapsed = listCollapsed.value;
  const units = listUnits(groups, collapsed);
  const cursor = listCursor.value;
  const at = unitAt(units, cursor);
  const cursorPeer = at?.at === "session" ? shown.find((peer) => peer.sid === at.sid) : undefined;

  return (
    <>
      <ListActions
        units={units}
        cursorPeer={cursorPeer}
        onFilter={() => {
          listFilterOpen.value = true;
        }}
      />
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
        <Act action="session-list.open-search" class="bar-link" title="今並んでいるものを絞る">
          絞る
        </Act>
        <a
          class="bar-link"
          href={href({ at: "terminals" })}
          onClick={(event: MouseEvent) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            navigate({ at: "terminals" });
          }}
        >
          端末
        </a>
      </div>

      <QuickFilter />
      <Launcher />
      <SessionSearch />

      {groups.length === 0 && (
        <section class="section">
          <h2>セッション (0)</h2>
          <p class="empty">
            {word !== ""
              ? "絞り込みに当たるセッションはありません。"
              : !connected
                ? "接続すると一覧が出ます。"
                : listSettled.value
                  ? "セッションはまだありません。"
                  : "一覧を聞いています…"}
          </p>
        </section>
      )}
      {groups.map((group) => {
        const shut = collapsed.has(group.section);
        const onHead = cursor === unitKey({ at: "section", section: group.section });
        return (
          <section class="section" key={group.section}>
            <h2 class={onHead ? "on-cursor" : undefined}>
              <button
                type="button"
                class="section-fold"
                aria-expanded={!shut}
                tabIndex={onHead ? 0 : -1}
                onClick={() => {
                  listCursor.value = unitKey({ at: "section", section: group.section });
                  toggleListSection(group.section, !shut);
                }}
              >
                {groupTitle(group.section, group.rows.length)}
              </button>
            </h2>
            {!shut && (
              <div class="rows">
                {group.rows.map((peer) => (
                  <PeerRow
                    key={peer.sid}
                    peer={peer}
                    section={group.section}
                    waiting={waiting.get(peer.sid) ?? 0}
                    now={now}
                    onCursor={
                      cursor === unitKey({ at: "session", section: group.section, sid: peer.sid })
                    }
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {/* まだ名乗っていないハーネスは、セッションの見出しの**後ろ**に置く。
          ここから出来ることは端末を覗くことだけで、一覧の中でいちばん手が
          少ない — 先頭に立てると、人が決めるべき行より先に、まだ何も言って
          いないものを読ませることになる。 */}
      {startingRuns.value.length > 0 && (
        <section class="section">
          <h2>起動中 ({startingRuns.value.length})</h2>
          <p class="empty">
            ハーネスは起動しているのに、状態ファイルも挨拶もまだ届いていません。端末を開いて
            様子を確かめてください。
          </p>
          <div class="rows">
            {startingRuns.value.map((row) => (
              <StartingRow key={`${row.instance} ${row.id}`} row={row} />
            ))}
          </div>
        </section>
      )}

      <section class="section">
        <h2>agents ({agents.value.length})</h2>
        <div class="rows">
          {agents.value.length === 0 && (
            <p class="empty">ハーネス側の追加セッションはありません。</p>
          )}
          {agents.value.map((agent) => (
            <AgentRow key={`${agent.instance} ${String(agent.pid)}`} agent={agent} />
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
