import { createContext } from "preact";
import { useContext, useEffect, useLayoutEffect, useMemo, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { liveness, reachable, type Sid, type TranscriptItem } from "@ccmsg/protocol";
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
import {
  type Anchor,
  anchorAt,
  anchorCentering,
  HeightBook,
  isAtBottom,
  sameRange,
  scrollTopAt,
  scrollTopByGrowth,
  totalHeight,
  visibleRange,
} from "../timeline/virtual-window.ts";
import {
  metricsOf,
  scrollBoxTo,
  ScrollerContext,
  scrollHeightOf,
  scrollTopOf,
  topOf,
  viewportOf,
} from "../layout/scroller.ts";
import type { TranscriptItemsView } from "../timeline/items-view.ts";
import { type WaitingMessage, waitingFor } from "../conversation/inbox.ts";
import {
  clearTimelineDisplay,
  departedMessages,
  displayFace,
  navigate,
  notifications,
  peers,
  preferredRoute,
  reading,
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
import { Composer } from "./Composer.tsx";
import { Fold } from "./Fold.tsx";
import { RelativeTime } from "./RelativeTime.tsx";
import { SearchBar, useInViewSearch } from "./SearchBar.tsx";

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

/** How close to an edge counts as being at it. A few pixels, since a wheel
 * rarely lands exactly on the end and a fractional device pixel never does. */
const EDGE_PX = 24;

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
    const from = { ...(cwd === undefined ? {} : { cwd }), ...(root === undefined ? {} : { root }) };
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
      : (displayPathFor(cwd, { cwd, ...(root === undefined ? {} : { root }) }) ?? ROOT);
  return useFileWords(sid, isAbsolutePath(base) ? ROOT : base, navigate);
}

/** How far from the top an older page is asked for — before the top, so the
 * page is usually there by the time it is reached. */
const REACH_PX = 400;

/** How much beyond the viewport is drawn, above and below. A finger moves
 * further than a frame lasts, so what is drawn has to reach past what is
 * seen. */
const OVERSCAN_PX = 600;

/** 何も測れていない間の 1 行の高さ。最初の描画で 1 つでも測れば、以降は測った
 * 分の平均が使われる (`HeightBook`)。 */
const ESTIMATE_PX = 48;

/** 描く範囲を決めている今の値。scroll のたびにではなく、**描く範囲が変わった
 * 時にだけ**書き換える — 指の動きの細かさで transcript を描き直さないため。 */
interface Layout {
  readonly scrollTop: number;
  readonly viewport: number;
  /** 頁の先頭から数えて、窓が始まる高さ。窓の上には接続バーも見出しも端の 1 行も
   * 載っている。
   *
   * 測るのは**空白ごと**の入れ物 (`.tl-window`) の上端で、描いている行の並びの
   * 上端ではない: 上の空白は描く範囲が変わるたびに伸び縮みするので、そこを
   * 起点にすると「どこを描くか」が「どこを描いているか」に依存して往復する。 */
  readonly listTop: number;
  /** 高さを測り直した回数。測った結果を描画に持ち込むための目印。 */
  readonly tick: number;
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

/** 送れる相手か、送れないならなぜか。
 *
 * 行から読む (契約の `liveness` / `reachable`)。断られてから知らせるのではなく、
 * 打つ前に言う — 送れない理由はどれも、人が先に手を打てるものになっている。 */
function sendability(sid: Sid): { live: boolean; why: string } {
  const peer = peers.value.find((one) => one.sid === sid);
  if (peer === undefined) {
    return { live: false, why: "このセッションは instance に接続していません" };
  }
  switch (liveness(peer, Date.now())) {
    case "duplicated":
      // 2 つのプロセスが同じ transcript を書いているので、instance は送るのを
      // 断る (契約 DR-0001 §3)。人がやることは run を選ぶこと。
      return { live: false, why: "同じセッションを 2 つのプロセスが書いています" };
    case "paused":
      return { live: false, why: "セッションは終了しています" };
    case "disappeared":
      return { live: false, why: "セッションは居なくなりました" };
    case "alive":
      return reachable(peer)
        ? { live: true, why: "" }
        : { live: false, why: "instance からも端末からも操作できない状態です" };
  }
}

function TimelineBody({ view }: { view: TranscriptItemsView }) {
  /** 窓が置かれている所。動かすのは本文のペインなので、ここは測る起点と、この
   * 画面の中だけを探すための囲いとして持つ。 */
  const pane = useRef<HTMLDivElement>(null);
  /** 動かす箱 (`Shell` が持つ本文のペイン)。まだ組み上がっていない間は何も
   * できないので、測る所も動かす所もここが答えるまで待つ。 */
  const scroller = useContext(ScrollerContext);
  const room = (): HTMLElement | null => scroller?.current ?? null;
  /** 空白ごとの入れ物と、描いている行の並び。前者が窓の起点で、後者が測る対象。 */
  const box = useRef<HTMLDivElement>(null);
  const items = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  /** 末尾へ置き直した時の、末尾の位置。追っている間ずっと末尾へ引き戻すと、端の
   * 数 px の中で上へ動こうとしている指を毎描画奪う。
   *
   * 中身の高さではなく末尾の位置を覚えるのは、画面が縮んだ時も末尾が動くから
   * (中身は 1 px も変わらないのに、末尾は viewport が縮んだ分だけ下がる)。 */
  const stuck = useRef(-1);
  /** 行と行の隙間 (CSS が決める)。行の高さに足して 1 行ぶんとして数えるので、
   * 覚えている高さの合計がそのまま窓の長さになる。 */
  const gap = useRef(0);
  /** 読んでいる行と、その上端からのずれ。上に行が足されても、高さを測り直して
   * も、この 1 行を同じ所に置き直すことで画面が動かない。 */
  const anchor = useRef<Anchor | undefined>(undefined);
  /** 置き直した時の窓の長さ。錨の行ごと形が変わった時の逃げ道に使う。 */
  const spanned = useRef(0);
  const held = view.items.value;
  // まだ渡っていない 1 通は、そのセッションに宛てて言われたもの。worker には
  // 宛先が無いので (話しかける相手は起動した側のセッション)、ここにも出ない。
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
  const search = useInViewSearch();
  const words = search.words.value;
  const units = useMemo(() => timelineSearchUnits(nodes), [nodes]);
  const matched = useMemo(() => matchingKeys(units, words), [units, words]);
  const nodesByUnit = useMemo(() => groupIndexByUnitKey(nodes), [nodes]);
  // 通知が「何に答えたか」と言う mid から、その 1 通が居る所へ。
  const itemsByMid = useMemo(() => itemIdsByMid(held), [held]);
  // 設定画面に並べる型は、この画面が実際に見たもの。窓が手放した分は消えるが、
  // 付けた値は型名で覚えているので、同じ型が戻ってくれば同じ行に戻る。
  const seenTypes = useMemo(() => {
    const seen: Record<Subject, Set<string>> = { main: new Set(), sub: new Set() };
    for (const item of held) seen[faceSubject(item.subject)].add(item.type);
    return seen;
  }, [held]);

  const book = useMemo(() => new HeightBook(ESTIMATE_PX), []);
  const keys = useMemo(() => nodes.map(nodeKey), [nodes]);
  const layout = useSignal<Layout>({ scrollTop: 0, viewport: 0, listTop: 0, tick: 0 });
  /** 今の描画が使っている高さ。effect の中は描画の外なので、描いた時の値を
   * そのまま読めるようにここに置く。 */
  const shownHeights = useRef<readonly number[]>([]);
  const { scrollTop, viewport, listTop, tick } = layout.value;
  const heights = useMemo(() => book.heights(keys), [book, keys, tick]);
  shownHeights.current = heights;
  const range = visibleRange(heights, scrollTop - listTop, viewport, OVERSCAN_PX);

  /** 今の DOM を読んで、描く範囲を決めている値を書き直す。範囲が変わらない
   * 限り何もしない (`bump` は測り直しを描画へ渡すためのもの)。 */
  const sync = (bump = false) => {
    const outer = box.current;
    const at = room();
    if (outer === null || at === null) return;
    const now = layout.peek();
    const next: Layout = {
      scrollTop: scrollTopOf(at),
      viewport: viewportOf(at),
      listTop: topOf(at, outer),
      tick: now.tick + (bump ? 1 : 0),
    };
    if (bump || next.viewport !== now.viewport || next.listTop !== now.listTop) {
      layout.value = next;
      return;
    }
    const was = visibleRange(
      shownHeights.current,
      now.scrollTop - now.listTop,
      now.viewport,
      OVERSCAN_PX,
    );
    const to = visibleRange(
      shownHeights.current,
      next.scrollTop - next.listTop,
      next.viewport,
      OVERSCAN_PX,
    );
    if (!sameRange(was, to)) layout.value = next;
  };

  /** 読んでいる所を覚え直す。
   *
   * 錨を打つのは**最初に目に入っている行**で、描き始めている行ではない。上下に
   * 広めに描いている分は読み手には見えていない。 */
  const remember = () => {
    const outer = box.current;
    const at = room();
    if (outer === null || at === null) return;
    const local = scrollTopOf(at) - topOf(at, outer);
    const seen = visibleRange(shownHeights.current, local, viewportOf(at), 0);
    anchor.current = anchorAt(keys, shownHeights.current, local, seen.first);
    spanned.current = totalHeight(shownHeights.current);
  };

  /** 追っているなら末尾へ、読んでいるなら覚えている行の所へ置き直す。
   *
   * 追っている間の置き直しは**中身の高さが変わった時だけ**。端とみなす数 px の
   * 中には、末尾から離れようとしている指も居るので、高さが動いてもいないのに
   * 引き戻すと、その指が毎描画奪われる。 */
  const place = () => {
    const outer = box.current;
    const at = room();
    if (outer === null || at === null) return;
    let to: number | undefined;
    if (following.current) {
      const bottom = scrollHeightOf(at) - viewportOf(at);
      if (bottom === stuck.current) return;
      stuck.current = bottom;
      to = bottom;
    } else {
      stuck.current = -1;
      const kept = anchor.current;
      if (kept === undefined) return;
      const found = scrollTopAt(keys, shownHeights.current, kept);
      const now = totalHeight(shownHeights.current);
      // 窓の手前 (端の 1 行の所) を読んでいる錨は負で来る。丸めるのはここ —
      // 窓が箱のどこから始まるかを知っているのはこちら側。
      to =
        found === undefined
          ? scrollTopByGrowth(scrollTopOf(at), spanned.current, now)
          : Math.max(0, topOf(at, outer) + found);
      spanned.current = now;
    }
    // 端数だけの違いで書き戻さない: 代入のたびに丸められて、描くたびに少しずつ
    // 位置がずれていく。
    if (Math.abs(scrollTopOf(at) - to) >= 0.5) scrollBoxTo(at, to);
  };

  // 一致した行を出す。畳まれている中の一致にも辿り着けるように、囲む fold を
  // 先に開く — 閉じた fold の中身はまだ描かれていないので、開ける前に探しても
  // その要素はまだ無い。描かれていない行も同じで、まず覚えている高さから位置を
  // 出して窓ごとそこへ動かし、要素が出てから真ん中に寄せ直す。
  const reveal = (key: string) => {
    for (const foldKey of foldPathsById(nodes).get(key) ?? []) {
      timelineFolds.value.set(foldKey, true);
    }
    // 探して当たった行の名前でも、かたまりそのものの名前でも辿り着ける —
    // 通知が指すのは行で、まだ渡っていない 1 通はかたまりの側にしか居ない。
    const own = keys.indexOf(key);
    const index = nodesByUnit.get(key) ?? (own < 0 ? undefined : own);
    const node = index === undefined ? undefined : keys[index];
    const at = room();
    if (node !== undefined && at !== null) {
      // 錨をその行に打ってから動かす。間に居る行の高さが見積もりから実測に
      // 変わっても、置き直しの先はその行のままになる。
      const kept = anchorCentering(keys, shownHeights.current, node, viewportOf(at));
      if (kept !== undefined) {
        following.current = false;
        anchor.current = kept;
        place();
        sync();
      }
    }
    requestAnimationFrame(() => {
      const found = pane.current?.querySelector(`[data-search-key="${CSS.escape(key)}"]`);
      if (found === null || found === undefined) return;
      found.scrollIntoView({ block: "center" });
      // 寄せた先を錨にし直す。かたまりの中の 40 行目のような一致では、かたまり
      // の上端を覚えたままだと、この後の測り直しがここで寄せた分を巻き戻す。
      remember();
      sync();
    });
  };

  // ハイライトを押したら、その行を今見ている番号にする (DR-0022: この数字の
  // 変化ではスクロールしない — 押した所は既に目の前にある)。
  const onClickIn = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest(".search-hl") === null) return;
    const key = target.closest("[data-search-key]")?.getAttribute("data-search-key");
    const at = key === null || key === undefined ? -1 : matched.indexOf(key);
    if (at >= 0) search.index.value = at + 1;
  };

  // 窓が動いた時。手放された行の高さは忘れ、読んでいる行を置き直す。
  useLayoutEffect(() => {
    book.keep(keys);
    // 追記は必ず末尾へ寄せる: 落ちた先頭と足された末尾が同じ高さなら、末尾は
    // 動いていないように見えてしまう。
    stuck.current = -1;
    place();
    sync();
  }, [keys, held]);

  // 描いたものを測る。測り直しは上に居る行の高さを変えうるので、覚えている行を
  // 置き直してから、新しい高さで描き直す。
  const measure = () => {
    const list = items.current;
    if (list === null) return;
    const drawn = Array.from(list.children, (child) => child.getBoundingClientRect());
    // 行と行の隙間も 1 行ぶんに含めて数える (CSS が決めた値をここに書き写すと、
    // 片方だけ変えられた時に窓の長さが静かにずれる)。
    const first = drawn[0];
    const second = drawn[1];
    if (first !== undefined && second !== undefined) gap.current = second.top - first.bottom;
    let changed = false;
    for (const [at, rect] of drawn.entries()) {
      const key = keys[range.first + at];
      if (key === undefined) continue;
      if (book.measured(key, rect.height + gap.current)) changed = true;
    }
    if (changed) shownHeights.current = book.heights(keys);
    place();
    sync(changed);
  };

  useLayoutEffect(measure);

  /** 今の描画の測り方。描画の外から呼ぶ道は、いつでも最新のものを通る。 */
  const remeasure = useRef(measure);
  remeasure.current = measure;

  // 行は自分で高さを変える: fold が開き、コードに色が付き、画面の幅が変わる。
  // どれも TimelineBody を描き直さないので、描画の外でも測り直す。
  useEffect(() => {
    const outer = pane.current;
    const list = items.current;
    if (outer === null || list === null) return;
    const watch = new ResizeObserver(() => {
      remeasure.current();
    });
    watch.observe(outer);
    watch.observe(list);
    return () => {
      watch.disconnect();
    };
  }, []);

  useEffect(() => {
    // A transcript shorter than the pane's own viewport never scrolls, so the
    // first page cannot be reached by scrolling to ask for the next. Nothing
    // drawn is not that case: the first page is already on its way, and
    // reading past it here would fetch a second page nobody has scrolled
    // towards.
    if (nodes.length === 0) return;
    const at = room();
    if (at !== null && scrollHeightOf(at) <= viewportOf(at)) void view.readOlder();
  }, [nodes, view]);

  /** 箱が動いた時。動かしているのは本文のペインなので、受けるのもそのペイン。 */
  const onScroll = () => {
    // 窓の上端は箱の途中なので、「遡りを頼む所」も箱の先頭からの距離ではなく
    // **窓の上端からの距離**で測る。
    const outer = box.current;
    const at = room();
    if (at === null) return;
    following.current = isAtBottom(metricsOf(at), EDGE_PX);
    sync();
    remember();
    if (outer !== null && scrollTopOf(at) - topOf(at, outer) <= REACH_PX) void view.readOlder();
  };

  /** 描画の外から呼ばれる道は、いつでも最新のものを通る (`remeasure` と同じ)。 */
  const onScrollNow = useRef(onScroll);
  onScrollNow.current = onScroll;

  useEffect(() => {
    const at = scroller?.current;
    if (at === undefined || at === null) return;
    const listen = () => {
      onScrollNow.current();
    };
    at.addEventListener("scroll", listen, { passive: true });
    // 窓が広くなると、見える範囲も末尾の位置も変わる。箱の中の要素は
    // ResizeObserver が見ているが、箱そのものの高さはこちらでしか分からない。
    window.addEventListener("resize", listen);
    return () => {
      at.removeEventListener("scroll", listen);
      window.removeEventListener("resize", listen);
    };
  }, [scroller]);

  const pathLinker = useTimelinePathLinker(view.sid);
  const fileWords = useTimelineFileWords(view.sid);
  const agent = view.agentId;
  return (
    <ViewContext.Provider value={view}>
      <PathLinkerContext.Provider value={pathLinker}>
        <FileWordsContext.Provider value={fileWords}>
          <SearchWordsContext.Provider value={words}>
            <section class="section timeline">
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
              <DisplayPanel types={seenTypes} />
              <SearchBar search={search} matched={matched} onReveal={reveal} />
              {view.failure.value !== undefined && <p class="banner">{view.failure.value}</p>}
              <div class="tl-pane" ref={pane} onClick={onClickIn}>
                <p class="empty tl-edge">
                  {view.atBeginning.value
                    ? "— 先頭 —"
                    : view.loading.value
                      ? "読み込み中…"
                      : "上にスクロールすると遡ります"}
                </p>
                <div class="tl-window" ref={box}>
                  <div class="tl-space" style={{ height: `${range.before}px` }} />
                  <div class="tl-items" ref={items}>
                    {nodes.slice(range.first, range.last).map((node, index) => (
                      <NodeView key={keys[range.first + index]} node={node} />
                    ))}
                  </div>
                  <div class="tl-space" style={{ height: `${range.after}px` }} />
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
              {/* worker には送り先が無い: 話しかける相手は worker を起動した
                セッションで、worker 自身は instance に繋いでいない。 */}
              {agent === undefined && <Composer sid={view.sid} {...sendability(view.sid)} />}
              <p class="footer">
                <button
                  type="button"
                  onClick={() => {
                    navigate(
                      agent === undefined
                        ? { at: "sessions" }
                        : { at: "session", sid: view.sid, tab: "timeline" },
                    );
                  }}
                >
                  {agent === undefined ? "一覧に戻る" : "親のセッションに戻る"}
                </button>
              </p>
            </section>
          </SearchWordsContext.Provider>
        </FileWordsContext.Provider>
      </PathLinkerContext.Provider>
    </ViewContext.Provider>
  );
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
      <button
        type="button"
        class="tl-reply-link"
        onClick={() => {
          onGo(key);
        }}
      >
        答えた 1 通へ
      </button>
    </>
  );
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
  const to = { at: "agent", sid, agentId } as const;
  return (
    <a
      class="tl-agent-link"
      href={href(to)}
      onClick={(event: MouseEvent) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigate(to);
      }}
    >
      この worker を開く
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
        <button
          type="button"
          class="tl-reading"
          title={`${ROUTE_LABELS[route]} と原文を行き来する (画面ぜんぶ)`}
          onClick={toggleReading}
        >
          {reading.value === "original" ? "訳" : "原文"}
        </button>
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
  return (
    <Fold
      class={`tl-bubble member ${voiceOf(item)}`.trimEnd()}
      style={`--member-h:${memberHue(memberOf(item))}`}
      folds={timelineFolds.value}
      foldKey={key}
      fallback={resolveDisplay(faceOf(timelineFaces.value, item.subject), item.type).open}
      summary={
        <>
          <span class="tl-mark" aria-hidden="true">
            {open ? "▼" : "▶"}
          </span>
          <span class="tl-who">{itemLabel(item)}</span>
          {!open && <span class="tl-brief">{messageBrief(item)}</span>}
          <RelativeTime at={item.at} />
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
