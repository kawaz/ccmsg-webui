import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import type { Sid } from "@ccmsg/protocol";
import { foldGroupLabel } from "../timeline/transcript-model.ts";
import type { ParsedLine, Segment, TimelineGroup } from "../timeline/transcript-model.ts";
import type { TranscriptView } from "../timeline/transcript-view.ts";
import { navigate, transcript } from "../state.ts";

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

function GroupView({ group }: { group: TimelineGroup }) {
  if (group.kind === "entry") return <LineView line={group.line} />;
  return (
    <details class="tl-fold">
      <summary>
        {foldGroupLabel(group.entries)} ({group.entries.length})
      </summary>
      {group.entries.map((entry) => (
        <LineView key={entry.offset} line={entry.line} />
      ))}
    </details>
  );
}

function LineView({ line }: { line: ParsedLine }) {
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
  return (
    <div class={`tl-line ${line.role}`}>
      <span class="tl-who">{line.role}</span>
      <div class="tl-body">
        {line.segments.map((segment, index) => (
          <SegmentView key={index} segment={segment} />
        ))}
      </div>
    </div>
  );
}

/** One block of a turn. Text is shown as it was written — reading it as
 * Markdown is a later slice — and everything that is not the conversation
 * itself is shown as what it was, in as few words as say it. */
function SegmentView({ segment }: { segment: Segment }) {
  switch (segment.kind) {
    case "text":
      return <p class="tl-text">{segment.text}</p>;
    case "thinking":
      return (
        <details class="tl-aside">
          <summary>思考 ({segment.text.length} 文字)</summary>
          <p class="tl-text">{segment.text}</p>
        </details>
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
