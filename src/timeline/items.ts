import type { TranscriptItem } from "@ccmsg/protocol";
import type { WaitingMessage } from "../conversation/inbox.ts";
import { type DisplayFaces, faceOf, resolveDisplay } from "./display.ts";

/** 型付き item を画面の並びに読むところ。
 *
 * 何がどの item かを決めるのは instance で、ここが読むのは**型の語彙だけ**。
 * transcript の record の形はここに書かれていないし、書けない — 届くのは
 * 分類された item であって、harness の file ではない。
 *
 * ここでやるのは 3 つだけ: 呼び出しと答えを結ぶこと、トップ層に立たない型が
 * 続いた分を 1 つの畳みにまとめること、そして知らない型が来ても必ず 1 行として
 * 出すこと。どの型がトップ層に立つかは `display.ts` が答える。 */

/** 呼び出しと、その答え。答えが手元に無い呼び出しは `result` を持たない
 * (範囲の外に居るだけで、壊れた指し先ではない)。 */
export interface ItemRow {
  readonly item: TranscriptItem;
  readonly result?: TranscriptItem;
}

/** 画面の 1 かたまり。会話と思考はそれ自身で 1 つ、それ以外は続いた分が
 * 1 つの畳みになる。
 *
 * `waiting` だけは transcript の item ではない — そのセッション宛てに言われて
 * まだ渡っていない 1 通で、渡れば同じ 1 通が item として現れる。並びに混ぜる
 * のは、それが**言われた時刻の所に居る**から: 待っているものを末尾に寄せると、
 * 渡った瞬間に別の場所へ飛ぶ。 */
export type TimelineNode =
  | { readonly kind: "row"; readonly row: ItemRow }
  | { readonly kind: "fold"; readonly rows: readonly ItemRow[] }
  | { readonly kind: "waiting"; readonly waiting: WaitingMessage };

/** まだ渡っていない 1 通を、言われた時刻の所に混ぜる。
 *
 * 既に item として現れているものは混ぜない。渡ったことは `inbox` の
 * `delivered` も言うが、transcript の方が先に着くことがあり、その 1 瞬だけ
 * 同じ 1 通が 2 つに見えるのを避ける — 照合は item の `msg_id`。 */
export function withWaiting(
  nodes: readonly TimelineNode[],
  waiting: readonly WaitingMessage[],
): readonly TimelineNode[] {
  if (waiting.length === 0) return nodes;
  const arrived = new Set<string>();
  for (const node of nodes) {
    for (const row of nodeRows(node)) {
      for (const one of [row.item, row.result]) {
        const mid = one === undefined ? undefined : textField(one, "msg_id");
        if (mid !== undefined) arrived.add(mid);
      }
    }
  }
  const held = waiting.filter((one) => !arrived.has(one.message.mid));
  if (held.length === 0) return nodes;
  const mixed: TimelineNode[] = [];
  let next = 0;
  for (const node of nodes) {
    const at = nodeAt(node);
    while (next < held.length && (held[next] as WaitingMessage).message.sent_at <= at) {
      mixed.push({ kind: "waiting", waiting: held[next] as WaitingMessage });
      next += 1;
    }
    mixed.push(node);
  }
  for (const one of held.slice(next)) mixed.push({ kind: "waiting", waiting: one });
  return mixed;
}

/** 送った 1 通の `mid` から、それが transcript のどの item になったか。
 *
 * 通知は「何に答えたか」を `mid` で言うので、読み手はその 1 通の所へ戻れる。
 * item 側でそれを名乗るのは `msg_id`。 */
export function itemIdsByMid(items: readonly TranscriptItem[]): ReadonlyMap<string, string> {
  const found = new Map<string, string>();
  for (const item of items) {
    const mid = textField(item, "msg_id");
    if (mid !== undefined && !found.has(mid)) found.set(mid, item.id);
  }
  return found;
}

/** そのかたまりの時刻。畳みは先頭の行の時刻で、そこから並びが始まる。 */
function nodeAt(node: TimelineNode): number {
  const first = nodeRows(node)[0];
  return first === undefined ? Number.POSITIVE_INFINITY : first.item.at;
}

/** 型付き item の並びを、画面が描く並びにする。
 *
 * 答えを呼び出しの中へ入れるのは 2 つの場合だけ: 直後に来た答え (道具は呼んだ
 * 所で結果まで読めた方がよい) と、agent への依頼の答え (何ターン後に返ってきて
 * も 1 つのやりとり)。それ以外の答えは来た所に置いて、どの呼び出しの答えかを
 * 名前で指す — 間に挟まったものを飛ばして畳むと、間の時間が消える。 */
export function buildTimeline(
  items: readonly TranscriptItem[],
  faces: DisplayFaces,
): readonly TimelineNode[] {
  const at = new Map<string, number>();
  const calls = new Map<string, number>();
  for (const [index, item] of items.entries()) {
    at.set(item.id, index);
    const key = textField(item, "tool_use_id");
    if (key !== undefined && field(item, "role") === "use") calls.set(key, index);
  }
  const child = new Map<number, number>();
  const folded = new Set<number>();
  for (const [index, item] of items.entries()) {
    const call = callOf(item, at, calls);
    if (call === undefined) continue;
    if (!item.type.startsWith("message.sub") && call !== index - 1) continue;
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
    if (!resolveDisplay(faceOf(faces, item.subject), item.type).top) {
      run.push(row);
      continue;
    }
    flush();
    nodes.push({ kind: "row", row });
  }
  flush();
  return nodes;
}

/** その答えが答えている呼び出しは、手元の何番目か。
 *
 * 答えは呼び出しを 2 つの言い方で指す: 読んだ側が付けた item の id
 * (`parent_item`、呼び出しを読んでいなければ付かない) と、harness が 2 つを
 * 組にした鍵 (`parent_tool_use_id`、必ず付く)。前者が手元で引けるならそれ、
 * 引けなければ鍵で手元の呼び出しに突き合わせる — 呼び出しが instance の読んだ
 * 範囲の外に居ただけで、こちらは前の頁で既に持っていることがある。 */
function callOf(
  item: TranscriptItem,
  at: ReadonlyMap<string, number>,
  calls: ReadonlyMap<string, number>,
): number | undefined {
  if (field(item, "role") !== "result") return undefined;
  const named = textField(item, "parent_item");
  const found = named === undefined ? undefined : at.get(named);
  if (found !== undefined) return found;
  const key = textField(item, "parent_tool_use_id");
  return key === undefined ? undefined : calls.get(key);
}

/** かたまりの名前。畳みの中の行の並びで決まるので、開閉しても遡っても同じ
 * 行を指し続ける。 */
export function nodeKey(node: TimelineNode): string {
  if (node.kind === "waiting") return `waiting ${node.waiting.message.mid}`;
  return node.kind === "row" ? node.row.item.id : (node.rows[0] as ItemRow).item.id;
}

export function nodeRows(node: TimelineNode): readonly ItemRow[] {
  if (node.kind === "waiting") return [];
  return node.kind === "row" ? [node.row] : node.rows;
}

/** 畳みが既定で開いているか。中の 1 つでも `open` の型が居れば開く — 読み手が
 * 気にしている型を 1 度決めれば、同じ畳みを何度も開かずに済む。 */
export function foldShouldOpen(rows: readonly ItemRow[], faces: DisplayFaces): boolean {
  return rows.some((row) => resolveDisplay(faceOf(faces, row.item.subject), row.item.type).open);
}

/** item が出しているうち、その item だけのもの。
 *
 * 共通のもの (どこから来たか・誰の並びか・いつか・何番目か) を除くと、残るのはその型が
 * 何を言っているか。専用の見た目が無い型を出す時の中身であり、探す対象でも
 * ある。 */
const COMMON_FIELDS = new Set([
  "id",
  "uuid",
  "subject",
  "source",
  "at",
  "turn",
  "type",
  "role",
  "parent_item",
  "result_item",
  "tool_use_id",
  "parent_tool_use_id",
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

/** 型名の最後の 1 語。`tool.Bash` の `Bash`、`hook.PreToolUse` の
 * `PreToolUse` — 誰かが付けた名前をそのまま出すところ。 */
export function typeTail(type: string): string {
  const at = type.lastIndexOf(".");
  return at < 0 ? type : type.slice(at + 1);
}

/** 生の record を取り寄せる先。1 つの record から読まれた item は同じ所を
 * 指すので、取り寄せは record ごとに 1 度で足りる。 */
export function recordRange(item: TranscriptItem): { before: number; max_bytes: number } {
  return { before: item.source.offset + item.source.bytes, max_bytes: item.source.bytes };
}
