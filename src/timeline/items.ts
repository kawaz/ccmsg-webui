import type { TranscriptItem } from "@ccmsg/protocol";

/** 型付き item を画面の並びに読むところ。
 *
 * 何がどの item かを決めるのは instance で、ここが読むのは**型の語彙だけ**。
 * transcript の record の形はここに書かれていないし、書けない — 届くのは
 * 分類された item であって、harness の file ではない。
 *
 * ここでやるのは 3 つだけ: 呼び出しと答えを `parent_item` で結ぶこと、続けて
 * 並んだ「会話でないもの」を 1 つの畳みにまとめること、そして知らない型が来て
 * も必ず 1 行として出すこと。 */

/** 呼び出しと、その答え。答えが手元に無い呼び出しは `result` を持たない
 * (範囲の外に居るだけで、壊れた指し先ではない)。 */
export interface ItemRow {
  readonly item: TranscriptItem;
  readonly result?: TranscriptItem;
}

/** 画面の 1 かたまり。会話と思考はそれ自身で 1 つ、それ以外は続いた分が
 * 1 つの畳みになる。 */
export type TimelineNode =
  | { readonly kind: "row"; readonly row: ItemRow }
  | { readonly kind: "fold"; readonly rows: readonly ItemRow[] };

/** 自動で開く設定が効く 4 つの軸。 */
export type ItemCategory = "thinking" | "ccmsg" | "agent" | "other";

/** item が読まれる場所。会話と思考は畳みの外に立ち、それ以外は畳みに入る。 */
type Lane = "conversation" | "thinking" | "aside";

function lane(item: TranscriptItem): Lane {
  if (item.type === "thinking") return "thinking";
  return item.type.startsWith("message:") ? "conversation" : "aside";
}

export function itemCategory(item: TranscriptItem): ItemCategory {
  if (item.type === "thinking") return "thinking";
  if (item.type.startsWith("message:session:")) return "ccmsg";
  if (
    item.type.startsWith("message:sub:") ||
    item.type === "tool:Agent" ||
    item.type === "tool:SendMessage"
  ) {
    return "agent";
  }
  return "other";
}

/** 型付き item の並びを、画面が描く並びにする。
 *
 * 答えを呼び出しの中へ入れるのは 2 つの場合だけ: 直後に来た答え (道具は呼んだ
 * 所で結果まで読めた方がよい) と、agent への依頼の答え (何ターン後に返ってきて
 * も 1 つのやりとり)。それ以外の答えは来た所に置いて、どの呼び出しの答えかを
 * 名前で指す — 間に挟まったものを飛ばして畳むと、間の時間が消える。 */
export function buildTimeline(items: readonly TranscriptItem[]): readonly TimelineNode[] {
  const at = new Map<string, number>();
  for (const [index, item] of items.entries()) at.set(item.id, index);
  const child = new Map<number, number>();
  const folded = new Set<number>();
  for (const [index, item] of items.entries()) {
    if (!("parent_item" in item)) continue;
    const call = at.get(item.parent_item);
    if (call === undefined) continue;
    if (!item.type.startsWith("message:sub") && call !== index - 1) continue;
    child.set(call, index);
    folded.add(index);
  }

  const nodes: TimelineNode[] = [];
  let run: ItemRow[] = [];
  const flush = () => {
    if (run.length > 0) nodes.push({ kind: "fold", rows: run });
    run = [];
  };
  for (const [index, item] of items.entries()) {
    if (folded.has(index)) continue;
    const answer = child.get(index);
    const row: ItemRow =
      answer === undefined ? { item } : { item, result: items[answer] as TranscriptItem };
    if (lane(item) === "aside") {
      run.push(row);
      continue;
    }
    flush();
    nodes.push({ kind: "row", row });
  }
  flush();
  return nodes;
}

/** かたまりの名前。畳みの中の行の並びで決まるので、開閉しても遡っても同じ
 * 行を指し続ける。 */
export function nodeKey(node: TimelineNode): string {
  return node.kind === "row" ? node.row.item.id : (node.rows[0] as ItemRow).item.id;
}

export function nodeRows(node: TimelineNode): readonly ItemRow[] {
  return node.kind === "row" ? [node.row] : node.rows;
}

/** 畳みの外側を出すか。1 つしか無く、思考でも会話でもない行は、畳みを開いて
 * 1 行に辿り着くだけの手数になるので、そのまま出す。 */
export function foldNeedsOuterFold(rows: readonly ItemRow[]): boolean {
  return rows.length > 1 || rows.some((row) => itemCategory(row.item) !== "other");
}

/** 畳みの見出し。軸ごとの数を決まった順で並べる。 */
export function foldLabel(rows: readonly ItemRow[]): string {
  const counts = new Map<ItemCategory, number>();
  for (const row of rows) {
    const category = itemCategory(row.item);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const names: Readonly<Record<ItemCategory, string>> = {
    thinking: "思考",
    ccmsg: "ccmsg",
    agent: "agent 通信",
    other: "item",
  };
  const order: readonly ItemCategory[] = ["thinking", "ccmsg", "agent", "other"];
  return order
    .filter((category) => (counts.get(category) ?? 0) > 0)
    .map((category) => `${String(counts.get(category))} ${names[category]}`)
    .join(" + ");
}

/** item が出しているうち、その item だけのもの。
 *
 * 共通のもの (どこから来たか・いつか・何番目か) を除くと、残るのはその型が
 * 何を言っているか。専用の見た目が無い型を出す時の中身であり、探す対象でも
 * ある。 */
const COMMON_FIELDS = new Set([
  "id",
  "uuid",
  "source",
  "at",
  "turn",
  "type",
  "role",
  "parent_item",
  "result_item",
]);

export function ownFields(item: TranscriptItem): Record<string, unknown> {
  const own: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (COMMON_FIELDS.has(key)) continue;
    own[key] = value;
  }
  return own;
}

/** その item が持っている 1 つの field。型ごとの見た目はここから読む。 */
export function field(item: TranscriptItem, name: string): unknown {
  return (item as unknown as Record<string, unknown>)[name];
}

export function textField(item: TranscriptItem, name: string): string | undefined {
  const value = field(item, name);
  return typeof value === "string" ? value : undefined;
}

/** 型名の最後の 1 語。`tool:Bash` の `Bash`、`hook:PreToolUse` の
 * `PreToolUse` — 誰かが付けた名前をそのまま出すところ。 */
export function typeTail(type: string): string {
  const at = type.lastIndexOf(":");
  return at < 0 ? type : type.slice(at + 1);
}

/** 生の record を取り寄せる先。1 つの record から読まれた item は同じ所を
 * 指すので、取り寄せは record ごとに 1 度で足りる。 */
export function recordRange(item: TranscriptItem): { before: number; max_bytes: number } {
  return { before: item.source.offset + item.source.bytes, max_bytes: item.source.bytes };
}
