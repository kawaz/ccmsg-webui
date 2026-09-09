import type { ParsedLine, Segment } from "./transcript-model.ts";
import { extractIncomingMessages, parseCcmsgReplyCommand } from "./transcript-model.ts";

/** 1 行として画面に出ている文字。
 *
 * 探すのはここに出ている文だけにする。読み込んである全文で数えると、
 * 「[3/12] と出ているのに 3 番目が見つからない」— 道具の呼び出しは 1 行に
 * 縮めて出しているので、縮めた先に無い語まで数えてしまう — ということが
 * 起きる。数えた一致は必ず目で追える、を保つ方を採る。 */

/** 見て分かる長さ。これ以上は出さないので、探す対象にもしない。 */
const BRIEF_CHARS = 160;

/** 何であれ 1 行に縮める: それと分かるだけの長さで、読み飛ばす必要はない
 * 長さで。 */
export function brief(value: unknown): string {
  const text = typeof value === "string" ? value : (JSON.stringify(value) ?? "");
  const oneLine = text.replaceAll(/\s+/g, " ").trim();
  return oneLine.length > BRIEF_CHARS ? `${oneLine.slice(0, BRIEF_CHARS)}…` : oneLine;
}

export function fileResult(result: { kind: string; content?: string; message?: string }): string {
  if (result.kind === "error") return result.message ?? "失敗";
  if (result.kind === "image") return "画像";
  return brief(result.content ?? "");
}

/** 1 つの block が画面に出している文字。SegmentView が描くものと同じ。 */
export function segmentText(segment: Segment): string {
  switch (segment.kind) {
    case "text":
    case "thinking":
      return segment.text;
    case "thinking-hidden":
      return segment.reason;
    case "tool-use":
      return `${segment.name} ${brief(segment.input)}`;
    case "file-read":
      return `Read ${segment.path}`;
    case "file-write":
      return `Write ${segment.path}`;
    case "file-edit":
      return `Edit ${segment.path}`;
    case "file-tool-result":
      return fileResult(segment.result);
    case "bash-use": {
      const reply = parseCcmsgReplyCommand(segment.command);
      return reply === undefined ? `Bash ${segment.command}` : reply.text;
    }
    case "bash-result":
      return brief(segment.text);
    case "bash-command":
      return segment.command;
    case "bash-command-output":
      return brief(segment.stdout ?? segment.stderr ?? "");
    case "agent-send":
      return `${segment.to} ${segment.summary ?? brief(segment.message)}`;
    case "agent-spawn":
      return `${segment.name} ${segment.description}`;
    case "slash-command-prefix":
      return `/${segment.command}`;
    case "tool-result":
      return brief(segment.text);
    case "unknown-segment":
      return `${segment.type} ${brief(segment.raw)}`;
  }
}

/** 1 行が画面に出している文字ぜんぶ。 */
export function lineText(line: ParsedLine): string {
  if (line.kind === "broken") return line.raw;
  if (line.kind === "meta") return `${line.type} ${line.summary}`;
  const incoming = extractIncomingMessages(line);
  if (incoming.length > 0) {
    return incoming.map((message) => `${message.fromLabel} ${message.text}`).join("\n");
  }
  return line.segments.map(segmentText).join("\n");
}
