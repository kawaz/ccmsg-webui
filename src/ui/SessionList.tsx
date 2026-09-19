import { computed } from "@preact/signals";
import { keepInViewVertically } from "../layout/scroller.ts";
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
import {
  agents,
  answering,
  instances,
  can,
  listCollapsed,
  listCursor,
  listFilter,
  listFilterOpen,
  listSettled,
  launcherOpen,
  offlineSearchOpen,
  llmRequests,
  navigate,
  peers,
  pinned,
  waitingBySid,
  togglePinned,
  toggleListSection,
  sessionErrors,
  setSortKey,
  sortKey,
  startingRuns,
  status,
  terminalIdOfSession,
} from "../state.ts";
import { actionOf } from "../actions/catalogue.ts";
import { run } from "../actions/tree.ts";
import { Act, Holder, standOn, useAction, useScope, useScopeKeys } from "./Scope.tsx";
import { terminalLabel } from "../terminals.ts";
import { OpenLink } from "./Terminals.tsx";

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
  if (terminalId === undefined) return null;
  return <OpenLink id={terminalId} />;
}

/** 見出しに立つ名前と、その下に何行あるか。 */
function groupTitle(section: SessionSection, count: number): string {
  return `${SESSION_SECTION_LABELS[section]} (${String(count)})`;
}

/** 並び順。**アイコン 1 つ**で、押すと選択肢が重なって出る (DR-0004 §2.4)。
 *
 * 選択肢を一覧の上に据え置くと、行を読む場所を常に取り上げることになる — 並び順は
 * 決めたら当分変えないものなので、出しっぱなしにする理由が無い。**今の並びは
 * アイコンが言う** (`title` と読み上げの名前) ので、開かなくても分かる。
 *
 * 開くこと自体はアクション (打鍵からも開ける)。中の選択は部品の中で閉じる操作で、
 * キーの一覧に「並びを日付にする」が並んでいたら変になる (DR-0003 §2.6)。 */
function SortPick() {
  const box = useRef<HTMLDivElement>(null);
  const said = SORT_LABELS[sortKey.value];
  useAction("session-list.sort", {
    enabled: () => true,
    run: () => {
      box.current?.togglePopover();
    },
  });
  return (
    <>
      <Act
        action="session-list.sort"
        class="sort-open"
        icon="⇅"
        label={`並び: ${said}`}
        title={`並び: ${said}`}
      />
      <div ref={box} id="sort-menu" class="sort-menu" popover="auto">
        {SORT_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            class={key === sortKey.value ? "menu-row on" : "menu-row"}
            aria-pressed={key === sortKey.value}
            onClick={() => {
              if (isSortKey(key)) setSortKey(key);
              box.current?.hidePopover();
            }}
          >
            {SORT_LABELS[key]}
          </button>
        ))}
      </div>
    </>
  );
}

/** 一覧の並びに効く操作の担当 (DR-0003 §2.3)。
 *
 * **同じ組を 2 か所が名乗る**: 行の中では自分の行を対象に、区画の上ではカーソルの
 * 行を対象に。押す所は行の中に居るので内側 (= その行) に当たり、打鍵は区画から
 * 登るのでカーソルの行に当たる — 押した所とキーで別の行が対象になることがない。
 *
 * ここに居るのは**留めること**だけ。改名も終了も削除も「そのセッションに効く」
 * 操作で、一覧の並びの話ではないので、開いているセッションのヘッダが持つ
 * (`session.*`、`SessionMenu.tsx`)。留めるだけが残るのは、**留めるが並びを
 * 動かす操作**だから — 対象は「一覧のこの行」で、開いている 1 つではない。 */
function usePinAction(peerOf: () => PeerInfo | undefined) {
  useAction("session-list.pin", {
    enabled: () => peerOf() !== undefined,
    run: () => {
      const peer = peerOf();
      if (peer !== undefined) togglePinned(peer.sid);
    },
  });
}

/** 行の中の押す所。押す所は**アクションを起こす 1 行**で、することの中身は
 * アクションの側にある (§2.4)。
 *
 * 行に残るのは**留める**だけ。改名・終了・削除は開いているセッションのヘッダに
 * 移した (DR-0004 §2.4) — 行に並べると、辿っている最中の行に危ない押す所が
 * ずっと出ていることになる。 */
function RowActions({ peer }: { peer: PeerInfo }) {
  const held = pinned.value.has(peer.sid);
  usePinAction(() => peer);
  return (
    <Act
      action="session-list.pin"
      class="row-pin"
      title={held ? "留めるのをやめる" : "一覧の先頭に留める"}
    >
      {held ? "★" : "☆"}
    </Act>
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
    const at = box.current;
    const pane = at?.closest(".pane-list");
    if (!onCursor || at === null || !(pane instanceof HTMLElement)) return;
    keepInViewVertically(at, pane);
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
  usePinAction(() => cursorPeer);
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
  useAction("session-list.search-offline", {
    enabled: () => true,
    run: () => {
      offlineSearchOpen.value = true;
    },
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
  const scope = useScope();
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
        <SortPick />
        <Act action="session-list.open-search" class="bar-link" title="今並んでいるものを絞る">
          絞る
        </Act>
        <a
          class="bar-link"
          href={href({ at: "terminals" })}
          onClick={(event: MouseEvent) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            run("app.open-terminals", scope);
          }}
        >
          {actionOf("app.open-terminals")?.title}
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
