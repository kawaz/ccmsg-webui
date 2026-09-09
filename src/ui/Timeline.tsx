import { createContext } from "preact";
import { useContext, useEffect, useLayoutEffect, useMemo, useRef } from "preact/hooks";
import type { Sid } from "@ccmsg/protocol";
import { filesRouteFor } from "../files/path-link.ts";
import { routePath } from "../route.ts";
import { foldGroupKey, foldPathsByOffset } from "../timeline/fold-tree.ts";
import { brief, fileResult } from "../timeline/segment-text.ts";
import { matchingKeys, type SearchWord, splitForHighlight } from "../search/in-view-search.ts";
import { timelineSearchUnits } from "../search/timeline-units.ts";
import { foldGroupShouldAutoOpen } from "../timeline/timeline-auto-open.ts";
import type { TimelineAutoOpenSettings } from "../timeline/timeline-auto-open.ts";
import {
  extractIncomingMessages,
  foldGroupLabel,
  foldGroupNeedsOuterFold,
  parseCcmsgReplyCommand,
} from "../timeline/transcript-model.ts";
import type { ParsedLine, Segment, TimelineGroup } from "../timeline/transcript-model.ts";
import type { TranscriptView } from "../timeline/transcript-view.ts";
import {
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

/** A session's transcript, read from its end.
 *
 * A transcript is followed forwards and read backwards, and the scroll position
 * is what says which of the two a person is doing: at the bottom they are
 * watching it happen, and anywhere else they are reading, which is why an
 * append moves the view only in the first case. */

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
        href: routePath(to),
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

export function Timeline({ sid }: { sid: Sid }) {
  const view = transcript.value;
  if (view === undefined || view.sid !== sid) {
    return <p class="empty">接続すると transcript を読みます。</p>;
  }
  return <TimelineBody view={view} />;
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

function TimelineBody({ view }: { view: TranscriptView }) {
  const scroller = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  /** What the content measured before this render, so a page added above can be
   * subtracted back out of the scroll position. */
  const measured = useRef({ height: 0, top: 0 });
  const groups = view.groups.value;
  const held = view.window.value;
  const search = useInViewSearch();
  const words = search.words.value;
  const units = useMemo(() => timelineSearchUnits(groups), [groups]);
  const matched = useMemo(() => matchingKeys(units, words), [units, words]);

  // 一致した行を出す。畳まれている中の一致にも辿り着けるように、囲む fold を
  // 先に開く — 閉じた fold の中身はまだ描かれていないので、開ける前に探しても
  // その要素はまだ無い。
  const reveal = (key: string) => {
    const offset = Number(key);
    for (const foldKey of foldPathsByOffset(groups).get(offset) ?? []) {
      timelineFolds.value.set(foldKey, true);
    }
    requestAnimationFrame(() => {
      scroller.current
        ?.querySelector(`[data-search-key="${key}"]`)
        ?.scrollIntoView({ block: "center" });
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

  useLayoutEffect(() => {
    const element = scroller.current;
    if (element === null) return;
    const before = measured.current;
    if (following.current) {
      element.scrollTop = element.scrollHeight;
    } else if (element.scrollHeight !== before.height) {
      // Content added above would otherwise carry the line being read away from
      // where it was; keeping the distance from the bottom keeps it still.
      element.scrollTop = before.top + (element.scrollHeight - before.height);
    }
    measured.current = { height: element.scrollHeight, top: element.scrollTop };
  }, [groups, held]);

  useEffect(() => {
    const element = scroller.current;
    if (element === null) return;
    // A transcript shorter than its own viewport never scrolls, so the first
    // page cannot be reached by scrolling to ask for the next.
    if (element.scrollHeight <= element.clientHeight) void view.readOlder();
  }, [groups, view]);

  const onScroll = (event: Event) => {
    const element = event.currentTarget as HTMLDivElement;
    following.current = element.scrollHeight - element.scrollTop - element.clientHeight <= EDGE_PX;
    measured.current = { height: element.scrollHeight, top: element.scrollTop };
    if (element.scrollTop <= REACH_PX) void view.readOlder();
  };

  const pathLinker = useTimelinePathLinker(view.sid);
  return (
    <PathLinkerContext.Provider value={pathLinker}>
      <SearchWordsContext.Provider value={words}>
        <section class="section timeline">
          <h2>
            transcript — {held.lines.length} 行 / {held.start}–{held.end} バイト
          </h2>
          <AutoOpenBar />
          <SearchBar search={search} matched={matched} onReveal={reveal} />
          {view.failure.value !== undefined && <p class="banner">{view.failure.value}</p>}
          <div class="tl-scroll" ref={scroller} onScroll={onScroll} onClick={onClickIn}>
            <p class="empty tl-edge">
              {view.atBeginning.value
                ? "— 先頭 —"
                : view.loading.value
                  ? "読み込み中…"
                  : "上にスクロールすると遡ります"}
            </p>
            {groups.map((group, index) => (
              <GroupView key={groupKey(group, index)} group={group} />
            ))}
            {groups.length === 0 && !view.loading.value && (
              <p class="empty">まだ transcript がありません。</p>
            )}
            {notifications.value
              .filter((held) => held.notification.sid === view.sid)
              .map((held) => (
                <div key={held.key} class="tl-bubble notice">
                  <span class="tl-who">通知</span>
                  <div class="tl-body">
                    <MarkdownView
                      source={held.notification.text}
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
  );
}

/** A group's identity is the byte offset of the line it starts at: stable when
 * an older page shifts every index in front of it. */
function groupKey(group: TimelineGroup, index: number): string | number {
  if (group.kind === "entry") return group.offset;
  return group.entries[0]?.offset ?? `fold-${index}`;
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

function GroupView({ group }: { group: TimelineGroup }) {
  if (group.kind === "entry") return <LineView line={group.line} offset={group.offset} />;
  // A group that is one plain item has nothing worth folding: opening "1 item"
  // to reach the item is a step that answers nothing.
  if (!foldGroupNeedsOuterFold(group.entries)) {
    const entry = group.entries[0]!;
    return <LineView line={entry.line} offset={entry.offset} />;
  }
  return (
    <Fold
      class="tl-fold"
      folds={timelineFolds.value}
      foldKey={foldGroupKey(group.entries)}
      fallback={foldGroupShouldAutoOpen(group.entries, timelineAutoOpen.value)}
      summary={`${foldGroupLabel(group.entries)} (${group.entries.length})`}
    >
      {group.entries.map((entry) => (
        <LineView key={entry.offset} line={entry.line} offset={entry.offset} />
      ))}
    </Fold>
  );
}

function LineView({ line, offset }: { line: ParsedLine; offset: number }) {
  const pathLinker = useContext(PathLinkerContext);
  const words = useContext(SearchWordsContext);
  if (line.kind === "broken") {
    return (
      <div class="tl-line broken" data-search-key={offset}>
        <span class="tl-who">壊れた行</span>
        <pre class="mono">{line.raw}</pre>
      </div>
    );
  }
  if (line.kind === "meta") {
    return (
      <div class="tl-line meta" data-search-key={offset}>
        <span class="tl-who">{line.type}</span>
        <span class="tl-text">{line.summary}</span>
      </div>
    );
  }
  // 会話は行の見た目より先に決まる: 封筒が載っている行はふつうの user turn
  // としてではなく、届いた 1 通ずつの吹き出しとして描く (封筒の生テキストを
  // Markdown として読ませると、返信案内や属性が本文に混ざる)。
  const incoming = extractIncomingMessages(line);
  if (incoming.length > 0) {
    return (
      <div class="tl-line incoming" data-search-key={offset}>
        {incoming.map((message, index) => (
          <div key={index} class="tl-bubble incoming">
            <span class="tl-who">{message.fromLabel}</span>
            <div class="tl-body">
              <MarkdownView
                source={message.text}
                restricted
                pathLinker={pathLinker}
                highlight={words}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }
  const restricted = line.role === "user";
  return (
    <div class={`tl-line ${line.role}`} data-search-key={offset}>
      <span class="tl-who">{line.role}</span>
      <div class="tl-body">
        {line.segments.map((segment, index) => (
          <SegmentView
            key={index}
            segment={segment}
            segmentKey={`${offset}:${index}`}
            restricted={restricted}
          />
        ))}
      </div>
    </div>
  );
}

/** One block of a turn.
 *
 * What a person or an agent wrote is read as Markdown; everything that is not
 * the conversation itself is shown as what it was, in as few words as say it.
 * The two are read by different rules: an agent writes Markdown on purpose,
 * while a person typing `#3 の件` means a hash and a number, so their text goes
 * through the restricted reading (see MarkdownView's `restricted`). */
function SegmentView({
  segment,
  segmentKey,
  restricted,
}: {
  segment: Segment;
  segmentKey: string;
  restricted: boolean;
}) {
  const pathLinker = useContext(PathLinkerContext);
  const words = useContext(SearchWordsContext);
  switch (segment.kind) {
    case "text":
      return (
        <div class="tl-text">
          <MarkdownView
            source={segment.text}
            restricted={restricted}
            pathLinker={pathLinker}
            highlight={words}
          />
        </div>
      );
    case "thinking":
      return (
        <Fold
          class="tl-aside"
          folds={timelineFolds.value}
          foldKey={`think:${segmentKey}`}
          fallback={timelineAutoOpen.value.thinking}
          summary={`思考 (${segment.text.length} 文字)`}
        >
          <div class="tl-text">
            <MarkdownView source={segment.text} pathLinker={pathLinker} highlight={words} />
          </div>
        </Fold>
      );
    case "thinking-hidden":
      return <p class="tl-note">思考 (本文なし: {segment.reason})</p>;
    case "tool-use":
      return <Tool name={segment.name} detail={brief(segment.input)} />;
    case "file-read":
      return <Tool name="Read" detail={segment.path} />;
    case "file-write":
      return <Tool name="Write" detail={`${segment.path} (${segment.content.length} 文字)`} />;
    case "file-edit":
      return <Tool name="Edit" detail={segment.path} />;
    case "file-tool-result":
      return <Tool name="result" detail={fileResult(segment.result)} />;
    case "bash-use": {
      // このセッションが人や相手に返した 1 通。コマンドとしてではなく、
      // 会話の片側として読めるようにする。
      const reply = parseCcmsgReplyCommand(segment.command);
      if (reply !== undefined) {
        return (
          <div class="tl-bubble reply">
            <span class="tl-who">{reply.to === undefined ? "→ 人" : `→ ${reply.to}`}</span>
            <div class="tl-body">
              <MarkdownView source={reply.text} pathLinker={pathLinker} highlight={words} />
            </div>
          </div>
        );
      }
      return <Tool name="Bash" detail={segment.command} />;
    }
    case "bash-result":
      return (
        <Tool name={segment.isError ? "Bash 失敗" : "Bash 出力"} detail={brief(segment.text)} />
      );
    case "bash-command":
      return <Tool name="! コマンド" detail={segment.command} />;
    case "bash-command-output":
      return <Tool name="! 出力" detail={brief(segment.stdout ?? segment.stderr ?? "")} />;
    case "agent-send":
      return <Tool name={`→ ${segment.to}`} detail={segment.summary ?? brief(segment.message)} />;
    case "agent-spawn":
      return <Tool name={`起動 ${segment.name}`} detail={segment.description} />;
    case "slash-command-prefix":
      return <p class="tl-note">/{segment.command}</p>;
    case "tool-result":
      return <Tool name={segment.isError ? "失敗" : "result"} detail={brief(segment.text)} />;
    case "unknown-segment":
      return <Tool name={segment.type} detail={brief(segment.raw)} />;
  }
}

function Tool({ name, detail }: { name: string; detail: string }) {
  const words = useContext(SearchWordsContext);
  return (
    <p class="tl-tool mono">
      <span class="tl-tool-name">{name}</span>
      {detail !== "" && <span class="tl-tool-detail">{highlighted(detail, words)}</span>}
    </p>
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
