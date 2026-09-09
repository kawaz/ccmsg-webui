import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import type { Sid } from "@ccmsg/protocol";
import { foldGroupKey } from "../timeline/fold-tree.ts";
import { foldGroupShouldAutoOpen } from "../timeline/timeline-auto-open.ts";
import type { TimelineAutoOpenSettings } from "../timeline/timeline-auto-open.ts";
import { foldGroupLabel, foldGroupNeedsOuterFold } from "../timeline/transcript-model.ts";
import type { ParsedLine, Segment, TimelineGroup } from "../timeline/transcript-model.ts";
import type { TranscriptView } from "../timeline/transcript-view.ts";
import {
  navigate,
  timelineAutoOpen,
  timelineFolds,
  toggleTimelineAutoOpenSetting,
  transcript,
} from "../state.ts";
import { MarkdownView } from "../markdown/markdown-view.tsx";
import { Fold } from "./Fold.tsx";

/** A session's transcript, read from its end.
 *
 * A transcript is followed forwards and read backwards, and the scroll position
 * is what says which of the two a person is doing: at the bottom they are
 * watching it happen, and anywhere else they are reading, which is why an
 * append moves the view only in the first case. */

/** How close to an edge counts as being at it. A few pixels, since a wheel
 * rarely lands exactly on the end and a fractional device pixel never does. */
const EDGE_PX = 24;
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

function TimelineBody({ view }: { view: TranscriptView }) {
  const scroller = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  /** What the content measured before this render, so a page added above can be
   * subtracted back out of the scroll position. */
  const measured = useRef({ height: 0, top: 0 });
  const groups = view.groups.value;
  const held = view.window.value;

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

  return (
    <section class="section timeline">
      <h2>
        transcript — {held.lines.length} 行 / {held.start}–{held.end} バイト
      </h2>
      <AutoOpenBar />
      {view.failure.value !== undefined && <p class="banner">{view.failure.value}</p>}
      <div class="tl-scroll" ref={scroller} onScroll={onScroll}>
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
      </div>
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
  if (line.kind === "broken") {
    return (
      <div class="tl-line broken">
        <span class="tl-who">壊れた行</span>
        <pre class="mono">{line.raw}</pre>
      </div>
    );
  }
  if (line.kind === "meta") {
    return (
      <div class="tl-line meta">
        <span class="tl-who">{line.type}</span>
        <span class="tl-text">{line.summary}</span>
      </div>
    );
  }
  const restricted = line.role === "user";
  return (
    <div class={`tl-line ${line.role}`}>
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
  switch (segment.kind) {
    case "text":
      return (
        <div class="tl-text">
          <MarkdownView source={segment.text} restricted={restricted} />
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
            <MarkdownView source={segment.text} />
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
    case "bash-use":
      return <Tool name="Bash" detail={segment.command} />;
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
  return (
    <p class="tl-tool mono">
      <span class="tl-tool-name">{name}</span>
      {detail !== "" && <span class="tl-tool-detail">{detail}</span>}
    </p>
  );
}

function fileResult(result: { kind: string; content?: string; message?: string }): string {
  if (result.kind === "error") return result.message ?? "失敗";
  if (result.kind === "image") return "画像";
  return brief(result.content ?? "");
}

/** One line of whatever it is given: enough to recognise, never enough to
 * scroll past. */
const BRIEF_CHARS = 160;

function brief(value: unknown): string {
  const text = typeof value === "string" ? value : (JSON.stringify(value) ?? "");
  const oneLine = text.replaceAll(/\s+/g, " ").trim();
  return oneLine.length > BRIEF_CHARS ? `${oneLine.slice(0, BRIEF_CHARS)}…` : oneLine;
}
