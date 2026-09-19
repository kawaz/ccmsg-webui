import { createContext } from "preact";
import { useContext, useEffect, useMemo, useRef } from "preact/hooks";
import { computed, useSignal } from "@preact/signals";
import type { Sid, TranscriptItem } from "@ccmsg/protocol";
import { filesRouteFor } from "../files/path-link.ts";
import { useFileWords } from "../files/file-word-link.ts";
import { href } from "../base.ts";
import {
  foldGroupKey,
  foldPathsById,
  messageFoldKey,
  rawFoldKey,
  thinkFoldKey,
} from "../timeline/fold-tree.ts";
import {
  brief,
  foldLabel,
  isGeneric,
  isTyped,
  itemDetail,
  itemLabel,
  itemProse,
  memberOf,
  voiceOf,
} from "../timeline/item-view.ts";
import { MAIN, memberHue } from "../member.ts";
import {
  foldShouldOpen,
  type ItemRow,
  itemIdsByMid,
  nodeKey,
  textField,
  type TimelineNode,
  withWaiting,
} from "../timeline/items.ts";
import {
  DISPLAY_AXES,
  type DisplayAxis,
  displayRows,
  isOwnValue,
  faceOf,
  faceSubject,
  resolveDisplay,
  type Subject,
  SUBJECTS,
} from "../timeline/display.ts";
import { matchingKeys, type SearchWord, splitForHighlight } from "../search/in-view-search.ts";
import { groupIndexByUnitKey, timelineSearchUnits } from "../search/timeline-units.ts";
import { scrollBoxTo, ScrollerContext, scrollTopOf, viewportOf } from "../layout/scroller.ts";
import type { TranscriptItemsView } from "../timeline/items-view.ts";
import { type WaitingMessage, waitingFor } from "../conversation/inbox.ts";
import {
  clearTimelineDisplay,
  departedMessages,
  displayFace,
  navigate,
  notifications,
  preferredRoute,
  reading,
  selectedItem,
  sessionPaths,
  setTimelineDisplay,
  timelineFaces,
  timelineFolds,
  toggleReading,
  transcript,
  translateRoutes,
  waitingMessages,
} from "../state.ts";
import { needsNoTranslation } from "../timeline/translate.ts";
import { ROUTE_LABELS } from "../timeline/translators.ts";
import { useTranslated } from "../timeline/use-translated.ts";
import {
  type FileWordCtx,
  type MarkdownPathLinker,
  markdownPlainText,
  MarkdownView,
} from "../markdown/markdown-view.tsx";
import { displayPathFor, isAbsolutePath, ROOT } from "../files/paths.ts";
import { Fold } from "./Fold.tsx";
import { RelativeTime } from "./RelativeTime.tsx";
import { SearchBar, useInViewSearch } from "./SearchBar.tsx";
import { actionOf } from "../actions/catalogue.ts";
import { run } from "../actions/tree.ts";
import { Act, Holder, Pane, useAction, useScope, useScopeKeys } from "./Scope.tsx";
import { hasVoiceNeighbour, stepInVoice, stepItem } from "../timeline/voice-nav.ts";

/** A session's transcript as the items an instance read it into, followed
 * forwards and read backwards.
 *
 * What is drawn is the type's vocabulary and nothing below it: a type this
 * build has no picture for is still drawn, as its name and the fields it
 * carries. The record behind an item is one click away rather than on screen —
 * `jsonl` fetches the line it was read from — which is what makes an item
 * whose classification looks thin something a person can check instead of
 * guess at.
 *
 * The scroll position says which of the two directions a person is going: at
 * the bottom they are watching it happen, and anywhere else they are reading,
 * which is why an append moves the view only in the first case. */

/** Where a path written in this transcript opens.
 *
 * Carried in a context rather than handed down: every level between the
 * timeline and the text that contains a path would otherwise take a prop it
 * does nothing with, and the value has to keep its identity across renders
 * anyway (MarkdownView re-renders its document when it changes). */
const PathLinkerContext = createContext<MarkdownPathLinker | undefined>(undefined);

/** ファイルの名前らしき語を繋ぐ先。渡り方は上と同じで、間の階層は素通し。 */
const FileWordsContext = createContext<FileWordCtx | undefined>(undefined);

/** 探している言葉。行の中のどこを光らせるかを決めるだけのもので、間の階層は
 * 素通しなので、パスのリンク先と同じく context で渡す。 */
const SearchWordsContext = createContext<readonly SearchWord[]>([]);

/** 生の record を取り寄せる先。どの item の下からでも同じ 1 行を頼むので、
 * 頼み先は画面ぜんぶで 1 つ。 */
const ViewContext = createContext<TranscriptItemsView | undefined>(undefined);

/** A relative path in a message body is read against the session's working
 * directory — the directory the session itself would have read it in. */
function useTimelinePathLinker(sid: Sid): MarkdownPathLinker | undefined {
  const session = sessionPaths(sid);
  const { cwd, root } = session;
  return useMemo(() => {
    const from = {
      ...(cwd === undefined ? {} : { cwd }),
      ...(root === undefined ? {} : { root }),
    };
    return (ref) => {
      const to = filesRouteFor(sid, ref, from);
      if (to === undefined) return undefined;
      return {
        href: href(to),
        onClick(event: MouseEvent) {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          navigate(to);
        },
      };
    };
  }, [sid, cwd, root]);
}
/** ファイルの名前らしき語を、この transcript の中から読む時の基準。
 *
 * 語が書かれた場所は session の作業 folder。木の中での綴りに直してから渡す —
 * 探すのは instance の木の中で、そこでの path は root からの綴りになる。 */
function useTimelineFileWords(sid: Sid): FileWordCtx {
  const session = sessionPaths(sid);
  const { cwd, root } = session;
  const base =
    cwd === undefined
      ? ROOT
      : (displayPathFor(cwd, {
          cwd,
          ...(root === undefined ? {} : { root }),
        }) ?? ROOT);
  return useFileWords(sid, isAbsolutePath(base) ? ROOT : base, navigate);
}

export function Timeline({ sid }: { sid: Sid }) {
  const view = transcript.value;
  if (view === undefined || view.sid !== sid) {
    return <p class="empty">接続すると transcript を読みます。</p>;
  }
  // 覚えているもの (測った高さ・読んでいる item) は 1 つの transcript のもの。
  // worker は同じ sid の別 transcript なので、名前に主語まで含める。
  return <TimelineBody key={`${view.sid}/${view.agentId ?? ""}`} view={view} />;
}

function TimelineBody({ view }: { view: TranscriptItemsView }) {
  const pane = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLParagraphElement>(null);
  const scroller = useContext(ScrollerContext);
  const room = (): HTMLElement | null => scroller?.current ?? null;
  const held = view.items.value;
  const rowsWaiting = waitingMessages.value;
  const gone = departedMessages.value;
  const groups = view.groups.value;
  const nodes = useMemo(
    () =>
      view.agentId === undefined
        ? withWaiting(groups, waitingFor(rowsWaiting, gone, view.sid))
        : groups,
    [groups, rowsWaiting, gone, view.sid, view.agentId],
  );
  const messages = useMemo(() => held.filter((one) => one.type.startsWith("message.")), [held]);
  const search = useInViewSearch();
  const words = search.words.value;
  const units = useMemo(() => timelineSearchUnits(nodes), [nodes]);
  const matched = useMemo(
    () => computed(() => matchingKeys(units, search.words.value)),
    [units, search],
  );
  const nodesByUnit = useMemo(() => groupIndexByUnitKey(nodes), [nodes]);
  const itemsByMid = useMemo(() => itemIdsByMid(held), [held]);
  const seenTypes = useMemo(() => {
    const seen: Record<Subject, Set<string>> = {
      main: new Set(),
      sub: new Set(),
    };
    for (const item of held) seen[faceSubject(item.subject)].add(item.type);
    return seen;
  }, [held]);
  const keys = useMemo(() => nodes.map(nodeKey), [nodes]);

  const reveal = (key: string) => {
    for (const foldKey of foldPathsById(nodes).get(key) ?? [])
      timelineFolds.value.set(foldKey, true);
    const own = keys.indexOf(key);
    const index = nodesByUnit.get(key) ?? (own < 0 ? undefined : own);
    const node = index === undefined ? undefined : keys[index];
    if (node === undefined) return;
    requestAnimationFrame(() => {
      pane.current
        ?.querySelector(`[data-search-key="${CSS.escape(key)}"]`)
        ?.scrollIntoView({ block: "center" });
    });
  };

  const onClickIn = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest(".search-hl") === null) return;
    const key = target.closest("[data-search-key]")?.getAttribute("data-search-key");
    const at = key === null || key === undefined ? -1 : matched.value.indexOf(key);
    if (at >= 0) search.index.value = at + 1;
  };

  useEffect(() => {
    const edge = top.current;
    const root = room();
    if (edge === null || root === null || view.atBeginning.value) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting === true) void view.readOlder();
      },
      { root, rootMargin: "400px 0px 0px" },
    );
    observer.observe(edge);
    return () => observer.disconnect();
  }, [view, nodes.length]);

  const select = (id: string | undefined): void => {
    if (id === undefined) return;
    selectedItem.value = id;
    reveal(id);
  };

  const page = (step: 1 | -1): void => {
    const at = room();
    if (at === null) return;
    scrollBoxTo(at, scrollTopOf(at) + viewportOf(at) * step);
    requestAnimationFrame(() => {
      const x = at.getBoundingClientRect().left + at.clientWidth / 2;
      const y =
        step < 0 ? at.getBoundingClientRect().top + 1 : at.getBoundingClientRect().bottom - 1;
      const line = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-search-key]");
      const id = line?.dataset["searchKey"];
      if (id !== undefined) selectedItem.value = id;
    });
  };

  const pathLinker = useTimelinePathLinker(view.sid);
  const fileWords = useTimelineFileWords(view.sid);
  const agent = view.agentId;
  return (
    <ViewContext.Provider value={view}>
      <PathLinkerContext.Provider value={pathLinker}>
        <FileWordsContext.Provider value={fileWords}>
          <SearchWordsContext.Provider value={words}>
            <Pane name="tl.body" label="transcript" class="tl-scope">
              <TimelineActions
                items={messages}
                select={select}
                page={page}
                openSearch={() => {
                  search.editing.value = true;
                }}
              />
              <section class="section timeline">
                <div class="timeline-head">
                  <h2>
                    {agent === undefined ? "transcript" : `worker ${agent}`} — {held.length} item
                  </h2>
                  {agent !== undefined && (
                    <p class="tl-note">
                      worker の transcript は読むだけで、追記は追いません — 追記を運ぶ topic は
                      セッションのもので、worker のものは契約にありません。続きは読み直すと出ます。
                    </p>
                  )}
                  <ReadingTabs />
                  <SearchBar search={search} matched={matched} onReveal={reveal} />
                </div>
                <DisplayPanel types={seenTypes} />
                {view.failure.value !== undefined && <p class="banner">{view.failure.value}</p>}
                <div class="tl-pane" ref={pane} onClick={onClickIn}>
                  <p class="empty tl-edge" ref={top}>
                    {view.atBeginning.value
                      ? "— 先頭 —"
                      : view.loading.value
                        ? "読み込み中…"
                        : "上にスクロールすると遡ります"}
                  </p>
                  <div class="tl-window">
                    <div class="tl-items">
                      {nodes.map((node, index) => (
                        <div class="tl-item" key={keys[index]}>
                          <NodeView node={node} />
                        </div>
                      ))}
                    </div>
                    <div class="tl-tail" aria-hidden="true" />
                  </div>
                  {nodes.length === 0 && !view.loading.value && (
                    <p class="empty">まだ transcript がありません。</p>
                  )}
                  {agent === undefined &&
                    notifications.value
                      .filter((one) => one.notification.sid === view.sid)
                      .map((one) => (
                        <div key={one.key} class="tl-bubble notice">
                          <span class="tl-who">通知</span>
                          <div class="tl-body">
                            <MarkdownView
                              source={one.notification.text}
                              pathLinker={pathLinker}
                              fileWords={fileWords}
                              highlight={words}
                            />
                            <p class="tl-note">
                              transcript に同じ返事が現れたらそちらが正
                              {one.notification.reply_to !== undefined && (
                                <ReplyToLink
                                  mid={one.notification.reply_to}
                                  at={itemsByMid}
                                  onGo={reveal}
                                />
                              )}
                            </p>
                          </div>
                        </div>
                      ))}
                </div>
                <p class="footer">
                  {agent === undefined ? (
                    <Act action="app.open-sessions" />
                  ) : (
                    <Act action="app.open-parent-session" />
                  )}
                </p>
              </section>
            </Pane>
          </SearchWordsContext.Provider>
        </FileWordsContext.Provider>
      </PathLinkerContext.Provider>
    </ViewContext.Provider>
  );
}

/** tl 本体が担当するアクションと、区画の役としての打鍵 (DR-0003 §2.7)。
 *
 * 上下は**スクロールと選択の両方**に効く。同じ声の前後は、選んでいる 1 通が
 * 決めた列を辿る — 選ぶ前のそれは、どの列かが決まらないので効かない。 */
function TimelineActions({
  items,
  select,
  page,
  openSearch,
}: {
  items: readonly TranscriptItem[];
  select: (id: string | undefined) => void;
  page: (step: 1 | -1) => void;
  openSearch: () => void;
}) {
  const at = (): string | undefined => selectedItem.value;
  useAction("timeline.select-message", {
    enabled: () => items.length > 0,
    run: () => {
      // まだ何も選んでいなければ先頭から。既に選んでいれば、その 1 通を画面へ
      // 出し直すだけ (選び直しではない)。
      select(at() ?? items[0]?.id);
    },
  });
  useAction("timeline.select-prev", {
    enabled: () => items.length > 0,
    run: () => {
      select(stepItem(items, at(), -1));
    },
  });
  useAction("timeline.select-next", {
    enabled: () => items.length > 0,
    run: () => {
      select(stepItem(items, at(), 1));
    },
  });
  useAction("timeline.page-up", {
    enabled: () => items.length > 0,
    run: () => {
      page(-1);
    },
  });
  useAction("timeline.page-down", {
    enabled: () => items.length > 0,
    run: () => {
      page(1);
    },
  });
  useAction("timeline.select-prev-in-voice", {
    enabled: () => hasVoiceNeighbour(items, selectedItem.value, -1),
    run: () => {
      select(stepInVoice(items, at(), -1));
    },
  });
  useAction("timeline.select-next-in-voice", {
    enabled: () => hasVoiceNeighbour(items, selectedItem.value, 1),
    run: () => {
      select(stepInVoice(items, at(), 1));
    },
  });
  useAction("timeline.open-search", {
    enabled: () => true,
    run: openSearch,
  });
  // 訳と原文の行き来は**画面ぜんぶに効く** (`state.ts` の `toggleReading`) ので、
  // 担当も 1 通ごとではなく tl が持つ。押す所は訳す所を持っている文の脇に出る。
  useAction("timeline.toggle-reading", {
    enabled: () => preferredRoute.value !== undefined,
    run: toggleReading,
  });
  useScopeKeys({
    ArrowUp: "timeline.select-prev",
    ArrowDown: "timeline.select-next",
    PageUp: "timeline.page-up",
    PageDown: "timeline.page-down",
    Slash: "timeline.open-search",
    Enter: "timeline.select-message",
  });
  return null;
}

/** 通知が答えた 1 通へ戻る所。
 *
 * 出すのはその 1 通が画面に居る時だけ — item として読み込まれているか、まだ
 * 渡らずに待っているか。どちらにも居ないなら、飛び先が無いので出さない。 */
function ReplyToLink({
  mid,
  at,
  onGo,
}: {
  mid: string;
  at: ReadonlyMap<string, string>;
  onGo: (key: string) => void;
}) {
  const waiting = waitingMessages.value.some((one) => one.mid === mid);
  const key = at.get(mid) ?? (waiting ? `waiting ${mid}` : undefined);
  if (key === undefined) return null;
  return (
    <>
      {" "}
      {/* 飛び先はこの 1 通なので、担当も**この 1 通が**持つ (§2.3)。 */}
      <Holder name={`reply-to ${mid}`}>
        <ReplyToAct target={key} onGo={onGo} />
      </Holder>
    </>
  );
}

function ReplyToAct({ target, onGo }: { target: string; onGo: (key: string) => void }) {
  useAction("timeline.go-to-replied", {
    enabled: () => true,
    run: () => {
      onGo(target);
    },
  });
  return <Act action="timeline.go-to-replied" class="tl-reply-link" />;
}

/** そのセッションに宛てて言われて、まだ渡っていない 1 通。
 *
 * 出しているのは instance の inbox そのもの — 人はこの topic を眺められて、
 * 眺めても配送の印は付かない。だから誰が言った分もここに出るし、渡った瞬間に
 * 消えるのも instance が言う (`delivered`)。消えた後は、同じ 1 通がこの
 * transcript の item として現れる。
 *
 * 届かなかった 1 通は消さずに印を変える: 待っているのと諦められたのが同じ
 * 見た目なら、言った人はどちらだったか分からない。 */
function WaitingView({ waiting }: { waiting: WaitingMessage }) {
  const { message, state } = waiting;
  const words = useContext(SearchWordsContext);
  const pathLinker = useContext(PathLinkerContext);
  const fileWords = useContext(FileWordsContext);
  return (
    <div class={`tl-bubble waiting waiting-${state}`}>
      <span class="tl-who">{message.from_label}</span>
      <div class="tl-body">
        <MarkdownView
          source={message.text}
          pathLinker={pathLinker}
          fileWords={fileWords}
          highlight={words}
        />
        <p class="tl-note">{WAITING_NOTES[state]}</p>
      </div>
    </div>
  );
}

/** 3 つの状態がそれぞれ人に言うこと。待っているのは「まだ」で、他の 2 つは
 * 「もう届かない」— 読み手が次に打つ手が違う。 */
const WAITING_NOTES: Readonly<Record<WaitingMessage["state"], string>> = {
  waiting: "まだ渡っていません。相手が受け取ったらここが transcript の item に変わります。",
  expired: "渡らないまま期限が切れました。届いていません。",
  dropped: "inbox が一杯で落とされました。届いていません。",
};

const AXIS_LABELS: Readonly<Record<DisplayAxis, string>> = {
  top: "トップ",
  open: "開く",
};

const SUBJECT_LABELS: Readonly<Record<Subject, string>> = {
  main: "セッション",
  sub: "worker",
};

/** 型ごとの表示属性を決める所。
 *
 * 並ぶのは組み込みが名乗っている型と、この画面で実際に見た型 (とその上の型)。
 * 継いでいる値は薄く出し、押せばこの型に付く。付けた値を外せば、また上の型か
 * 組み込みが答える。
 *
 * 表は主語ごとに 1 面。開いた時に出ているのは今読んでいる面で、もう一面は
 * タブで切り替える — worker の読み方を、worker を開く前に決められるように。 */
/** 本文を何で読むか。
 *
 * 訳す道具が 1 つも無ければ何も出さない (対応していないブラウザで、押せない
 * 選択肢が並ぶだけになる)。**訳す人の名前をそのまま並べる**のは、同じ段落でも
 * 道具が違えば違う文が出るから — おかしな 1 文に出会った時、どの道具の仕業かが
 * 読む人の判断材料になる。混ぜて 1 つにすると、それが消える。 */
function ReadingTabs() {
  const routes = translateRoutes.value;
  if (routes.length === 0) return null;
  const held = reading.value;
  return (
    <p class="tl-display-tabs" role="group" aria-label="本文の言語">
      <button
        type="button"
        class={held === "original" ? "on" : undefined}
        aria-pressed={held === "original"}
        onClick={() => {
          reading.value = "original";
        }}
      >
        原文
      </button>
      {routes.map((route) => (
        <button
          key={route}
          type="button"
          class={held === route ? "on" : undefined}
          aria-pressed={held === route}
          onClick={() => {
            reading.value = route;
          }}
        >
          {ROUTE_LABELS[route]}
        </button>
      ))}
    </p>
  );
}

function DisplayPanel({ types }: { types: Readonly<Record<Subject, ReadonlySet<string>>> }) {
  const editing = useSignal<Subject>("main");
  const subject = editing.value;
  const face = displayFace(subject);
  const rows = displayRows(face, types[subject]);
  return (
    <details class="tl-display">
      <summary>表示</summary>
      <p class="tl-display-tabs">
        {SUBJECTS.map((one) => (
          <button
            key={one}
            type="button"
            class={one === subject ? "on" : undefined}
            aria-pressed={one === subject}
            onClick={() => {
              editing.value = one;
            }}
          >
            {SUBJECT_LABELS[one]}
          </button>
        ))}
      </p>
      <p class="tl-display-note">
        トップ = TL のトップ層に立てる (外すと続いた分が 1 つの畳みに入る)。開く =
        既定で開いた状態にする。薄い印は上の型か組み込みから継いだ値。
      </p>
      <table class="tl-display-table">
        <thead>
          <tr>
            <th scope="col">型</th>
            {DISPLAY_AXES.map((axis) => (
              <th key={axis} scope="col">
                {AXIS_LABELS[axis]}
              </th>
            ))}
            <th scope="col">
              <span class="visually-hidden">上書き</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((type) => {
            const resolved = resolveDisplay(face, type);
            const own = DISPLAY_AXES.some((axis) => isOwnValue(face.settings, type, axis));
            return (
              <tr key={type}>
                <th scope="row" class="mono">
                  {type}
                </th>
                {DISPLAY_AXES.map((axis) => (
                  <td key={axis}>
                    <input
                      type="checkbox"
                      aria-label={`${type} の${AXIS_LABELS[axis]}`}
                      class={isOwnValue(face.settings, type, axis) ? undefined : "inherited"}
                      checked={resolved[axis]}
                      onChange={(event) => {
                        setTimelineDisplay(
                          subject,
                          type,
                          axis,
                          (event.currentTarget as HTMLInputElement).checked,
                        );
                      }}
                    />
                  </td>
                ))}
                <td>
                  <button
                    type="button"
                    disabled={!own}
                    onClick={() => {
                      clearTimelineDisplay(subject, type);
                    }}
                  >
                    継ぐ
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}

function NodeView({ node }: { node: TimelineNode }) {
  if (node.kind === "waiting") return <WaitingView waiting={node.waiting} />;
  if (node.kind === "row") return <RowView row={node.row} />;
  return (
    <Fold
      class="tl-fold"
      folds={timelineFolds.value}
      foldKey={foldGroupKey(node.rows)}
      fallback={foldShouldOpen(node.rows, timelineFaces.value)}
      summary={foldLabel(node.rows)}
    >
      {node.rows.map((row) => (
        <RowView key={row.item.id} row={row} />
      ))}
    </Fold>
  );
}

/** One item, and the answer folded into it when there is one.
 *
 * The three shapes are the three ways an item reads: what someone said is a
 * message, what a session thought is an aside worth folding, and everything
 * else is a line naming what happened. A type with no picture of its own still
 * lands in the third, under its own name and carrying its own fields, so a
 * newcomer to the vocabulary appears rather than disappears. */
/** worker を名指しうる型。ここに無い型の `agent_id` を入口にしないのは、同じ
 * 名前の field が「起動した相手」ではなく「自分」を指す型があるため。 */
const NAMES_AN_AGENT = new Set([
  "message.sub.out",
  "message.sub.in",
  "message.team.out",
  "message.team.in",
  "tool.Agent",
]);

/** その行が名指している worker。呼び出し側と答えのどちらが id を持っているかは
 * 型によるので、行の両方を見る — 起動した所からその worker の transcript へ
 * 降りられることが要るのであって、id がどちらに書かれていたかは関心ではない。 */
function agentOf(row: ItemRow): string | undefined {
  const named = [row.item, row.result].filter((one) => one !== undefined);
  for (const one of named) {
    if (!NAMES_AN_AGENT.has(one.type)) continue;
    const id = textField(one, "agent_id");
    if (id !== undefined && id !== "") return id;
  }
  return undefined;
}

/** その worker を主語にして開くリンク。親の transcript に出るのは指示と返って
 * きた答えだけで、その worker が何を叩いたかは worker 自身の transcript にしか
 * 無い。 */
function AgentLink({ sid, agentId }: { sid: Sid; agentId: string }) {
  return (
    <Holder name={`worker ${agentId}`}>
      <AgentGo sid={sid} agentId={agentId} />
    </Holder>
  );
}

function AgentGo({ sid, agentId }: { sid: Sid; agentId: string }) {
  const scope = useScope();
  const to = { at: "agent", sid, agentId } as const;
  useAction("timeline.open-worker", {
    enabled: () => true,
    run: () => {
      navigate(to);
    },
  });
  return (
    <a
      class="tl-agent-link"
      href={href(to)}
      onClick={(event: MouseEvent) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        run("timeline.open-worker", scope);
      }}
    >
      {actionOf("timeline.open-worker")?.title}
    </a>
  );
}

function RowView({ row }: { row: ItemRow }) {
  const { item } = row;
  const view = useContext(ViewContext);
  const agent = agentOf(row);
  const link =
    agent === undefined || view === undefined || view.agentId === agent ? undefined : (
      <AgentLink sid={view.sid} agentId={agent} />
    );
  if (item.type === "thinking") {
    return (
      <div class="tl-line thinking" data-search-key={item.id}>
        <ThinkingView item={item} />
        <RawFold item={item} />
      </div>
    );
  }
  if (item.type.startsWith("message.")) {
    return (
      <div class="tl-line message" data-search-key={item.id}>
        <MessageView item={item} />
        {row.result !== undefined && (
          <div class="tl-nested">
            <MessageView item={row.result} />
            <RawFold item={row.result} />
          </div>
        )}
        {link}
        <RawFold item={item} />
      </div>
    );
  }
  return (
    <div class={`tl-line item${isGeneric(item) ? " generic" : ""}`} data-search-key={item.id}>
      <ItemLine item={item} />
      {row.result !== undefined && <ItemLine item={row.result} />}
      {link}
      <RawFold item={item} />
    </div>
  );
}

/** 畳んだ 1 通が名乗りの隣で言うこと。
 *
 * 書き手が markdown のつもりで書いた文は、記法を落とした素文にする — 要約に
 * `## ` や `**` が残っていても、そこは畳んだ中身の代わりにならない。人が打った
 * 文はそのまま出す: 打った通りに読むのが restricted の約束で (`#3 の件` は見出し
 * ではない)、記法として剥がすと打っていない文が要約に出る。 */
function messageBrief(item: TranscriptItem): string {
  const prose = itemProse(item);
  if (prose === undefined || prose === "") return brief(itemDetail(item));
  return brief(isTyped(item) ? prose : markdownPlainText(prose));
}

/** item の文。読み方の設定に従って、原文か訳のどちらかを描く。
 *
 * 訳すのは**文だけ**で、道具の引数も code も通らない — 訳して意味が変わらない
 * のは散文だけで、識別子やパスは訳された瞬間に別のものを指す。訳が届くのは
 * 段落ごとなので、途中は「訳した段落 + まだ原文の段落」が並ぶ。 */
function Prose({
  text,
  restricted,
  linker,
  words,
}: {
  text: string;
  restricted?: boolean;
  linker: MarkdownPathLinker | undefined;
  words: readonly SearchWord[];
}) {
  const fileWords = useContext(FileWordsContext);
  const shown = useTranslated(text);
  const route = preferredRoute.value;
  // 入口は**訳す所を持っている文にだけ**出す。日本語だけの文に付けても、押して
  // 何も変わらないものが並ぶだけで、どれを押せば変わるのかが読めなくなる。
  const offered = route !== undefined && !needsNoTranslation(text);
  return (
    <>
      {offered && (
        <Act
          action="timeline.toggle-reading"
          class="tl-reading"
          title={`${ROUTE_LABELS[route]} と原文を行き来する (画面ぜんぶ)`}
        >
          {reading.value === "original" ? "訳" : "原文"}
        </Act>
      )}
      {shown.pending && <span class="tl-translating">訳しています…</span>}
      <MarkdownView
        source={shown.text}
        {...(restricted === undefined ? {} : { restricted })}
        pathLinker={linker}
        fileWords={fileWords}
        highlight={words}
      />
    </>
  );
}

/** 1 通。名乗りは畳んでも見えたままで、畳むのは本文の側 — 誰が言ったかは並びを
 * 追うのに要るが、何を言ったかは読み手が開く時に要る。 */
function MessageView({ item }: { item: TranscriptItem }) {
  const pathLinker = useContext(PathLinkerContext);
  const words = useContext(SearchWordsContext);
  const prose = itemProse(item);
  const key = messageFoldKey(item.id);
  // 要約は閉じている間だけ出す。開いた本文の上に同じ文を残すと、探す所も読み
  // 上げる所も同じ文を 2 度数える。
  const open = timelineFolds.value.isOpen(
    key,
    resolveDisplay(faceOf(timelineFaces.value, item.subject), item.type).open,
  );
  // 選んでいる 1 通は、吹き出しの階層と両立させる — 枠を足すのではなく、その
  // 吹き出し自身の色で縁を強める (色は DR-0001 の段のまま)。
  const chosen = selectedItem.value === item.id;
  return (
    <Fold
      class={`tl-bubble member ${voiceOf(item)}${chosen ? " chosen" : ""}`.trimEnd()}
      style={`--member-h:${memberHue(memberOf(item))}`}
      folds={timelineFolds.value}
      foldKey={key}
      fallback={resolveDisplay(faceOf(timelineFaces.value, item.subject), item.type).open}
      summary={
        <>
          <span class="tl-mark" aria-hidden="true">
            {open ? "▼" : "▶"}
          </span>
          {/* 押した 1 通が選んだ 1 通になる。畳みの開け閉めはそのまま (押した
              所で畳みが動くのは今までどおり)。 */}
          <span
            class="tl-who"
            onClick={() => {
              selectedItem.value = item.id;
            }}
          >
            {itemLabel(item)}
          </span>
          {!open && <span class="tl-brief">{messageBrief(item)}</span>}
          <RelativeTime at={item.at} />
          {chosen && (
            // 同じ声の前後へ。押す所と打鍵が同じアクションを起こすので、
            // 「この声だけ辿る」がどちらの手でも同じものになる (§2.4)。
            <span
              class="tl-voice-nav"
              onClick={(event: MouseEvent) => {
                // 畳みの開け閉めは summary の既定の動き。ここを押した時だけは
                // 畳まずに、選択だけを動かす。
                event.preventDefault();
              }}
            >
              <Act action="timeline.select-prev-in-voice" label="同じ声の前へ">
                ▲
              </Act>
              <Act action="timeline.select-next-in-voice" label="同じ声の次へ">
                ▼
              </Act>
            </span>
          )}
        </>
      }
    >
      <div class="tl-body">
        {prose === undefined || prose === "" ? (
          <p class="tl-note">{itemDetail(item)}</p>
        ) : (
          <Prose text={prose} restricted={isTyped(item)} linker={pathLinker} words={words} />
        )}
      </div>
    </Fold>
  );
}

function ThinkingView({ item }: { item: TranscriptItem }) {
  const pathLinker = useContext(PathLinkerContext);
  const words = useContext(SearchWordsContext);
  const text = itemProse(item) ?? "";
  return (
    <Fold
      class="tl-aside member"
      style={`--member-h:${memberHue(MAIN)}`}
      folds={timelineFolds.value}
      foldKey={thinkFoldKey(item.id)}
      fallback={resolveDisplay(faceOf(timelineFaces.value, item.subject), item.type).open}
      summary={`思考 (${text.length} 文字)`}
    >
      <div class="tl-text">
        <Prose text={text} linker={pathLinker} words={words} />
      </div>
    </Fold>
  );
}

/** 会話でも思考でもない item の 1 行。名乗りと、その型が言っていること。 */
function ItemLine({ item }: { item: TranscriptItem }) {
  const words = useContext(SearchWordsContext);
  const detail = itemDetail(item);
  return (
    <p class="tl-tool mono">
      <span class="tl-tool-name">{itemLabel(item)}</span>
      {detail !== "" && <span class="tl-tool-detail">{highlighted(detail, words)}</span>}
      <RelativeTime at={item.at} />
    </p>
  );
}

/** 元の record。押されるまで取り寄せない — 分類が足りているうちは要らないし、
 * 足りていない所では、これが確かめる唯一の道になる。
 *
 * 1 つの record から読まれた item は同じ所を指すので、どれの下から開いても
 * 出てくるのは同じ 1 行。 */
function RawFold({ item }: { item: TranscriptItem }) {
  const view = useContext(ViewContext);
  const key = rawFoldKey(item.uuid);
  const open = timelineFolds.value.isOpen(key, false);
  useEffect(() => {
    if (open) void view?.readRecord(item);
  }, [open, view, item]);
  const record = view?.records.value.get(item.uuid);
  return (
    <Fold class="tl-raw" folds={timelineFolds.value} foldKey={key} fallback={false} summary="jsonl">
      <pre class="mono">
        {record === undefined || record.state === "loading" ? "取り寄せています…" : record.text}
      </pre>
    </Fold>
  );
}

/** 道具の 1 行のような、markdown を通さない文の中を光らせる。 */
function highlighted(text: string, words: readonly SearchWord[]) {
  if (words.length === 0) return text;
  return splitForHighlight(text, words).map((piece, at) =>
    piece.color === undefined ? (
      piece.text
    ) : (
      <mark key={at} class="search-hl" data-search-color={piece.color}>
        {piece.text}
      </mark>
    ),
  );
}
