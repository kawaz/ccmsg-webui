import { createContext } from "preact";
import { useContext, useEffect, useLayoutEffect, useMemo, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import type { Sid, TranscriptItem } from "@ccmsg/protocol";
import { filesRouteFor } from "../files/path-link.ts";
import { href } from "../base.ts";
import { foldGroupKey, foldPathsById, rawFoldKey, thinkFoldKey } from "../timeline/fold-tree.ts";
import {
  foldLabel,
  isGeneric,
  isTyped,
  itemDetail,
  itemLabel,
  itemProse,
} from "../timeline/item-view.ts";
import { foldNeedsOuterFold, type ItemRow, nodeKey, type TimelineNode } from "../timeline/items.ts";
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
import { foldShouldAutoOpen } from "../timeline/timeline-auto-open.ts";
import type { TimelineAutoOpenSettings } from "../timeline/timeline-auto-open.ts";
import type { TranscriptItemsView } from "../timeline/items-view.ts";
import { heldFor } from "../conversation/held-messages.ts";
import { describeUndelivered } from "../conversation/send-outcome.ts";
import {
  dropHeld,
  heldMessages,
  lastLive,
  navigate,
  notifications,
  peers,
  sessionPaths,
  timelineAutoOpen,
  timelineFolds,
  toggleTimelineAutoOpenSetting,
  transcript,
} from "../state.ts";
import { type MarkdownPathLinker, MarkdownView } from "../markdown/markdown-view.tsx";
import { Composer } from "./Composer.tsx";
import { Fold } from "./Fold.tsx";
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
  /** scroller の中で、窓が始まる高さ。窓の上には端の 1 行が載っている。
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
  return <TimelineBody key={view.sid} view={view} />;
}

/** 送れる相手か、送れないならなぜか。
 *
 * 送れるのは instance が今つながっていると言っているセッションだけ。止まった
 * ものは last_live に残っているので、どう終わったかをそのまま理由にする。 */
function sendability(sid: Sid): { live: boolean; why: string } {
  const peer = peers.value.find((one) => one.sid === sid);
  if (peer !== undefined) {
    if (peer.state === "live_unmanaged") {
      return { live: false, why: "instance からも端末からも操作できない状態です" };
    }
    return { live: true, why: "" };
  }
  const gone = lastLive.value.find((one) => one.sid === sid);
  if (gone?.state === "paused") return { live: false, why: "セッションは終了しています" };
  if (gone?.state === "disappeared") return { live: false, why: "セッションは居なくなりました" };
  return { live: false, why: "このセッションは instance に接続していません" };
}

function TimelineBody({ view }: { view: TranscriptItemsView }) {
  const scroller = useRef<HTMLDivElement>(null);
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
  const nodes = view.groups.value;
  const held = view.items.value;
  const search = useInViewSearch();
  const words = search.words.value;
  const units = useMemo(() => timelineSearchUnits(nodes), [nodes]);
  const matched = useMemo(() => matchingKeys(units, words), [units, words]);
  const nodesByUnit = useMemo(() => groupIndexByUnitKey(nodes), [nodes]);

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

  const listTopOf = (element: HTMLDivElement, outer: HTMLDivElement) =>
    outer.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop;

  /** 今の DOM を読んで、描く範囲を決めている値を書き直す。範囲が変わらない
   * 限り何もしない (`bump` は測り直しを描画へ渡すためのもの)。 */
  const sync = (bump = false) => {
    const element = scroller.current;
    const outer = box.current;
    if (element === null || outer === null) return;
    const now = layout.peek();
    const next: Layout = {
      scrollTop: element.scrollTop,
      viewport: element.clientHeight,
      listTop: listTopOf(element, outer),
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
   * 広めに描いている分は読み手には見えていないし、ブラウザ自身の scroll
   * anchoring も見えている要素を固定するので、そこを揃えないと両者が別々の行を
   * 固定して押し合う。 */
  const remember = () => {
    const element = scroller.current;
    const outer = box.current;
    if (element === null || outer === null) return;
    const local = element.scrollTop - listTopOf(element, outer);
    const seen = visibleRange(shownHeights.current, local, element.clientHeight, 0);
    anchor.current = anchorAt(keys, shownHeights.current, local, seen.first);
    spanned.current = totalHeight(shownHeights.current);
  };

  /** 追っているなら末尾へ、読んでいるなら覚えている行の所へ置き直す。
   *
   * 追っている間の置き直しは**中身の高さが変わった時だけ**。端とみなす数 px の
   * 中には、末尾から離れようとしている指も居るので、高さが動いてもいないのに
   * 引き戻すと、その指が毎描画奪われる。 */
  const place = () => {
    const element = scroller.current;
    const outer = box.current;
    if (element === null || outer === null) return;
    let to: number | undefined;
    if (following.current) {
      const bottom = element.scrollHeight - element.clientHeight;
      if (bottom === stuck.current) return;
      stuck.current = bottom;
      to = bottom;
    } else {
      stuck.current = -1;
      const kept = anchor.current;
      if (kept === undefined) return;
      const at = scrollTopAt(keys, shownHeights.current, kept);
      const now = totalHeight(shownHeights.current);
      // 窓の手前 (端の 1 行の所) を読んでいる錨は負で来る。丸めるのはここ —
      // 窓が scroller のどこから始まるかを知っているのはこちら側。
      to =
        at === undefined
          ? scrollTopByGrowth(element.scrollTop, spanned.current, now)
          : Math.max(0, listTopOf(element, outer) + at);
      spanned.current = now;
    }
    // 端数だけの違いで書き戻さない: 代入のたびに丸められて、描くたびに少しずつ
    // 位置がずれていく。
    if (Math.abs(element.scrollTop - to) >= 0.5) element.scrollTop = to;
  };

  // 一致した行を出す。畳まれている中の一致にも辿り着けるように、囲む fold を
  // 先に開く — 閉じた fold の中身はまだ描かれていないので、開ける前に探しても
  // その要素はまだ無い。描かれていない行も同じで、まず覚えている高さから位置を
  // 出して窓ごとそこへ動かし、要素が出てから真ん中に寄せ直す。
  const reveal = (key: string) => {
    for (const foldKey of foldPathsById(nodes).get(key) ?? []) {
      timelineFolds.value.set(foldKey, true);
    }
    const element = scroller.current;
    const index = nodesByUnit.get(key);
    const node = index === undefined ? undefined : keys[index];
    if (element !== null && node !== undefined) {
      // 錨をその行に打ってから動かす。間に居る行の高さが見積もりから実測に
      // 変わっても、置き直しの先はその行のままになる。
      const kept = anchorCentering(keys, shownHeights.current, node, element.clientHeight);
      if (kept !== undefined) {
        following.current = false;
        anchor.current = kept;
        place();
        sync();
      }
    }
    requestAnimationFrame(() => {
      const found = scroller.current?.querySelector(`[data-search-key="${CSS.escape(key)}"]`);
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
    const element = scroller.current;
    const list = items.current;
    if (element === null || list === null) return;
    const watch = new ResizeObserver(() => {
      remeasure.current();
    });
    watch.observe(element);
    watch.observe(list);
    return () => {
      watch.disconnect();
    };
  }, []);

  useEffect(() => {
    const element = scroller.current;
    if (element === null) return;
    // A transcript shorter than its own viewport never scrolls, so the first
    // page cannot be reached by scrolling to ask for the next.
    if (element.scrollHeight <= element.clientHeight) void view.readOlder();
  }, [nodes, view]);

  const onScroll = (event: Event) => {
    const element = event.currentTarget as HTMLDivElement;
    following.current = isAtBottom(element, EDGE_PX);
    sync();
    remember();
    if (element.scrollTop <= REACH_PX) void view.readOlder();
  };

  const pathLinker = useTimelinePathLinker(view.sid);
  return (
    <ViewContext.Provider value={view}>
      <PathLinkerContext.Provider value={pathLinker}>
        <SearchWordsContext.Provider value={words}>
          <section class="section timeline">
            <h2>transcript — {held.length} item</h2>
            <AutoOpenBar />
            <SearchBar search={search} matched={matched} onReveal={reveal} />
            <HeldList sid={view.sid} />
            {view.failure.value !== undefined && <p class="banner">{view.failure.value}</p>}
            <div class="tl-scroll" ref={scroller} onScroll={onScroll} onClick={onClickIn}>
              <p class="empty tl-edge">
                {view.atBeginning.value
                  ? "— 先頭 —"
                  : view.loading.value
                    ? "読み込み中…"
                    : "上にスクロールすると遡ります"}
              </p>
              {view.gap.value !== undefined && <p class="tl-note tl-edge">{view.gap.value}</p>}
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
              {notifications.value
                .filter((one) => one.notification.sid === view.sid)
                .map((one) => (
                  <div key={one.key} class="tl-bubble notice">
                    <span class="tl-who">通知</span>
                    <div class="tl-body">
                      <MarkdownView
                        source={one.notification.text}
                        pathLinker={pathLinker}
                        highlight={words}
                      />
                      <p class="tl-note">transcript に同じ返事が現れたらそちらが正</p>
                    </div>
                  </div>
                ))}
            </div>
            <Composer sid={view.sid} {...sendability(view.sid)} />
            <p class="footer">
              <button
                type="button"
                onClick={() => {
                  navigate({ at: "sessions" });
                }}
              >
                一覧に戻る
              </button>
            </p>
          </section>
        </SearchWordsContext.Provider>
      </PathLinkerContext.Provider>
    </ViewContext.Provider>
  );
}

/** この画面から送って、まだ相手に渡っていない 1 通たち。
 *
 * 出せるのはここから送った分だけ。人としてつないだ接続には `inbox` の frame が
 * 来ないので (`held-messages.ts`)、他の誰かが送った分や、渡った瞬間はここには
 * 出ない。「消す」は届いた印ではなく、人が気にしないと決めたということ。 */
function HeldList({ sid }: { sid: Sid }) {
  const waiting = heldFor(heldMessages.value, sid);
  if (waiting.length === 0) return null;
  return (
    <div class="held">
      <p class="held-head">この画面から送って、まだ渡っていない {waiting.length} 通</p>
      {waiting.map((one) => (
        <div key={one.key} class="held-row">
          <span class="held-who">人</span>
          <span class="held-text">{one.text}</span>
          <span class="held-why">{describeUndelivered(one.reason)}</span>
          <button
            type="button"
            onClick={() => {
              dropHeld(one.key);
            }}
          >
            消す
          </button>
        </div>
      ))}
    </div>
  );
}

/** Which kinds of fold open by themselves. The four are the categories a fold
 * can be about, so a reader who cares about one of them sets it once rather
 * than opening the same kind of fold over and over. */
const AUTO_OPEN_LABELS: Readonly<Record<keyof TimelineAutoOpenSettings, string>> = {
  thinking: "思考",
  ccmsg: "ccmsg",
  agent: "agent 通信",
  items: "その他",
};

function AutoOpenBar() {
  const settings = timelineAutoOpen.value;
  return (
    <p class="tl-autoopen">
      <span class="tl-autoopen-label">自動で開く</span>
      {(Object.keys(AUTO_OPEN_LABELS) as (keyof TimelineAutoOpenSettings)[]).map((key) => (
        <label key={key}>
          <input
            type="checkbox"
            checked={settings[key]}
            onChange={() => {
              toggleTimelineAutoOpenSetting(key);
            }}
          />
          {AUTO_OPEN_LABELS[key]}
        </label>
      ))}
    </p>
  );
}

function NodeView({ node }: { node: TimelineNode }) {
  if (node.kind === "row") return <RowView row={node.row} />;
  // A group that is one plain item has nothing worth folding: opening "1 item"
  // to reach the item is a step that answers nothing.
  if (!foldNeedsOuterFold(node.rows)) return <RowView row={node.rows[0] as ItemRow} />;
  return (
    <Fold
      class="tl-fold"
      folds={timelineFolds.value}
      foldKey={foldGroupKey(node.rows)}
      fallback={foldShouldAutoOpen(node.rows, timelineAutoOpen.value)}
      summary={`${foldLabel(node.rows)} (${node.rows.length})`}
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
function RowView({ row }: { row: ItemRow }) {
  const { item } = row;
  if (item.type === "thinking") {
    return (
      <div class="tl-line thinking" data-search-key={item.id}>
        <ThinkingView item={item} />
        <RawFold item={item} />
      </div>
    );
  }
  if (item.type.startsWith("message:")) {
    return (
      <div class="tl-line message" data-search-key={item.id}>
        <MessageView item={item} />
        {row.result !== undefined && (
          <div class="tl-nested">
            <MessageView item={row.result} />
            <RawFold item={row.result} />
          </div>
        )}
        <RawFold item={item} />
      </div>
    );
  }
  return (
    <div class={`tl-line item${isGeneric(item) ? " generic" : ""}`} data-search-key={item.id}>
      <ItemLine item={item} />
      {row.result !== undefined && <ItemLine item={row.result} />}
      <RawFold item={item} />
    </div>
  );
}

function MessageView({ item }: { item: TranscriptItem }) {
  const pathLinker = useContext(PathLinkerContext);
  const words = useContext(SearchWordsContext);
  const prose = itemProse(item);
  // 会話の 2 方向を色で分ける: 届いたものと、このセッションが出したもの。
  const way = item.type.endsWith(":in") ? "incoming" : "reply";
  return (
    <div class={`tl-bubble ${way}`}>
      <span class="tl-who">{itemLabel(item)}</span>
      <div class="tl-body">
        {prose === undefined || prose === "" ? (
          <p class="tl-note">{itemDetail(item)}</p>
        ) : (
          <MarkdownView
            source={prose}
            restricted={isTyped(item)}
            pathLinker={pathLinker}
            highlight={words}
          />
        )}
      </div>
    </div>
  );
}

function ThinkingView({ item }: { item: TranscriptItem }) {
  const pathLinker = useContext(PathLinkerContext);
  const words = useContext(SearchWordsContext);
  const text = itemProse(item) ?? "";
  return (
    <Fold
      class="tl-aside"
      folds={timelineFolds.value}
      foldKey={thinkFoldKey(item.id)}
      fallback={timelineAutoOpen.value.thinking}
      summary={`思考 (${text.length} 文字)`}
    >
      <div class="tl-text">
        <MarkdownView source={text} pathLinker={pathLinker} highlight={words} />
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
