import { TRANSCRIPT_ITEM_TYPES, type TranscriptItem } from "@ccmsg/protocol";
import { field, type ItemRow, ownFields, textField, typeTail } from "./items.ts";

/** 型 1 つ 1 つが画面で何と名乗り、何を出すか。
 *
 * 表に無い型も必ず出る: 名前は型名そのまま、中身はその item だけが持っている
 * field を並べたもの。分類が届かなかった所を隠さないためで、そこが `jsonl` を
 * 押して元の record を見る入口になる。 */

/** 見て分かる長さ。これ以上は出さないので、探す対象にもしない。 */
const BRIEF_CHARS = 160;

/** 何であれ 1 行に縮める。 */
export function brief(value: unknown): string {
  const text = typeof value === "string" ? value : (JSON.stringify(value) ?? "");
  const oneLine = text.replaceAll(/\s+/g, " ").trim();
  return oneLine.length > BRIEF_CHARS ? `${oneLine.slice(0, BRIEF_CHARS)}…` : oneLine;
}

function count(item: TranscriptItem, name: string): string | undefined {
  const value = field(item, name);
  return typeof value === "number" ? String(value) : undefined;
}

function words(...parts: (string | undefined)[]): string {
  return parts.filter((part) => part !== undefined && part !== "").join(" ");
}

/** 呼び出しか答えか。役を持たない型は片方しかないので、名前だけで足りる。 */
function isResult(item: TranscriptItem): boolean {
  return field(item, "role") === "result";
}

/** その item の名乗り。 */
export function itemLabel(item: TranscriptItem): string {
  const type = item.type;
  switch (type) {
    case "message.user.in":
      return "人";
    case "message.user.out":
      return "セッション";
    case "message.session.in":
      return `← ${textField(item, "from") ?? "セッション"}`;
    case "message.session.out":
      return `→ ${textField(item, "to") ?? "人"}`;
    case "message.sub.out":
      return `→ ${textField(item, "name") ?? textField(item, "subagent_type") ?? "agent"}`;
    case "message.sub.in":
      return `← ${textField(item, "agent_id") ?? "agent"}`;
    // 主語から見た上と横。worker を主語にすると `parent` が自分を起動した所を
    // 指し、`team` は名前を持って立ち続けている相手との往復になる。
    //
    // 名乗るのは `harness_name` — 型が言うのは**主語から見た関係**なので、
    // 相手そのものの名前は型に出ない。harness が付けた名前 (`main`、lead の
    // 名前、teammate 名) が分かればそれを出し、分からない時だけ関係の名で
    // 呼ぶ (agent が開口一番に受け取る指示書には、上から来たとしか書かれて
    // いない)。
    case "message.parent.in":
      return `← ${textField(item, "harness_name") ?? "親"}`;
    case "message.parent.out":
      return `→ ${textField(item, "harness_name") ?? "親"}`;
    case "message.team.in":
      return `← ${textField(item, "harness_name") ?? textField(item, "agent_id") ?? "teammate"}`;
    case "message.team.out":
      return `→ ${textField(item, "harness_name") ?? "teammate"}`;
    case "thinking":
      return "思考";
    case "notice.slash":
      return `/${textField(item, "command") ?? ""}`;
    case "notice.interrupt":
      return "中断";
    case "system.compact":
      return "要約";
    case "system.api.error":
      return "API 失敗";
    case "system.task":
      return "task";
    case "system.caveat":
      return "注意";
    case "system.resume":
      return "再開";
    case "system.unknown":
      return "未分類";
  }
  if (type.startsWith("system.attachment.")) return `添付 ${typeTail(type)}`;
  if (type.startsWith("hook.")) return `hook ${textField(item, "hook_name") ?? typeTail(type)}`;
  if (type.startsWith("tool.")) {
    const name = typeTail(type);
    return isResult(item) ? `${name} の結果` : name;
  }
  return type;
}

/** 専用の見た目を持っている道具。ここに無い道具も出るが、出るのは呼ばれた時の
 * 入力そのままで、読みやすく整えた形ではない。 */
const DRAWN_TOOLS = new Set([
  "Bash",
  "Read",
  "Write",
  "Edit",
  "Grep",
  "Glob",
  "Agent",
  "SendMessage",
  "Skill",
  "Monitor",
]);

/** 汎用形で出ている item か。
 *
 * 型名と field をそのまま並べているだけ = この build がその型を読めていない、
 * ということ。そこは分類の甘い所なので、元の record への入口を既定で出す。 */
export function isGeneric(item: TranscriptItem): boolean {
  const type = item.type;
  if (type === "system.unknown" || type.startsWith("system.attachment.")) return true;
  if (type.startsWith("tool.")) return !DRAWN_TOOLS.has(typeTail(type));
  return !(TRANSCRIPT_ITEM_TYPES as readonly string[]).includes(type) && !type.startsWith("hook.");
}

/** markdown として読む文。会話と思考だけがこれを持つ — 書いた側がそのつもりで
 * 書いているのはここだけで、道具の入出力は文書ではない。 */
export function itemProse(item: TranscriptItem): string | undefined {
  if (item.type === "message.sub.out") return textField(item, "prompt");
  if (item.type.startsWith("message.") || item.type === "thinking") return textField(item, "text");
  return undefined;
}

/** 人が打った文かどうか。同じ markdown でも読み方を変える (`#3 の件` は
 * 見出しではない)。 */
export function isTyped(item: TranscriptItem): boolean {
  return item.type === "message.user.in" || item.type === "message.session.in";
}

/** その item が持っているファイルの位置。書かれたパスをその場所へ繋ぐため
 * だけのもの。 */
export function itemPath(item: TranscriptItem): string | undefined {
  return textField(item, "file_path");
}

/** 名乗りの後ろに 1 行で出るもの。 */
export function itemDetail(item: TranscriptItem): string {
  const type = item.type;
  const result = isResult(item);
  if (type === "tool.Bash") {
    if (!result) return textField(item, "command") ?? "";
    const out = words(textField(item, "stdout"), textField(item, "stderr"));
    return words(field(item, "interrupted") === true ? "(中断)" : undefined, brief(out));
  }
  if (type === "tool.Read") {
    return result
      ? words(
          count(item, "lines") === undefined ? undefined : `${String(count(item, "lines"))} 行`,
          count(item, "bytes") === undefined ? undefined : `${String(count(item, "bytes"))} バイト`,
        )
      : words(itemPath(item), count(item, "limit"));
  }
  if (type === "tool.Write" || type === "tool.Edit") {
    if (result) return field(item, "ok") === true ? "ok" : "失敗";
    return words(
      itemPath(item),
      type === "tool.Write"
        ? count(item, "lines")
        : words(count(item, "old_lines"), "→", count(item, "new_lines")),
    );
  }
  if (type === "tool.Grep" || type === "tool.Glob") {
    return result
      ? `${count(item, "matches") ?? "0"} 件`
      : words(textField(item, "pattern"), textField(item, "path"));
  }
  if (type === "tool.Agent" && !result) {
    return words(textField(item, "name"), textField(item, "description"));
  }
  if (type === "tool.SendMessage" && !result) {
    return words(textField(item, "to"), textField(item, "summary"));
  }
  if (type === "tool.Skill" && !result) {
    return words(textField(item, "skill"), textField(item, "args"));
  }
  if (type === "tool.Monitor" && !result) return textField(item, "description") ?? "";
  if (type.startsWith("hook.")) {
    return words(textField(item, "outcome"), brief(textField(item, "content")));
  }
  if (type === "notice.slash") {
    return words(textField(item, "args"), brief(textField(item, "stdout")));
  }
  if (type === "system.unknown") return brief(field(item, "record"));
  const text = textField(item, "text");
  if (text !== undefined) return brief(text);
  return brief(ownFields(item));
}

/** 1 行が画面に出している文字ぜんぶ。探すのはここに出ているものだけ — 縮めた
 * 先に無い語まで数えると、「[3/12] と出ているのに 3 番目が見つからない」に
 * なる。 */
export function rowText(row: ItemRow): string {
  const parts = [itemText(row.item)];
  if (row.result !== undefined) parts.push(itemText(row.result));
  return parts.join("\n");
}

function itemText(item: TranscriptItem): string {
  return words(itemLabel(item), itemProse(item) ?? itemDetail(item));
}

/** 畳みの見出し。何行畳まれていて、そのうち幾つをこの build が読めていないか。
 *
 * 汎用形を別に数えるのは、「item が 3 つ」と「そのうち 2 つは型名と field を
 * 並べているだけ」が、開くかどうかを決める時に別の話になるから。 */
export function foldLabel(rows: readonly ItemRow[]): string {
  const generic = rows.filter((row) => isGeneric(row.item)).length;
  const head = `${rows.length} item`;
  return generic === 0 ? head : `${head} (${generic} 汎用形)`;
}
