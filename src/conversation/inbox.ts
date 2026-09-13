import type { InboxElement, InboxMessage, InboxRemoved, Sid } from "@ccmsg/protocol";

/** セッション宛てに言われて、まだそのセッションが受け取っていない 1 通たち。
 *
 * 契約では `inbox` は**人も読める** topic で、人が読んでも配送の印は付かない
 * (session が読むのは配送そのもの、人が読むのは眺めるだけ)。だからここが持てる
 * のは「この画面が送った分」ではなく、**instance が待たせている分そのもの** —
 * 誰が送ったものでも、いつ渡ったかも、instance が言う。
 *
 * 行は `mid` で照合し、消えるのは `removed` の element が来た時だけ。消えた
 * 理由が 3 つに分かれているのは、読み手が別々に描くものだから: `delivered` は
 * 相手が受け取ったので、同じ 1 通が相手の transcript 側に現れる (= 画面から
 * 消してよい)。`expired` / `dropped` は届かなかったし今後も届かないので、
 * **消さずに印を変える** — 待っているのと諦められたのが同じ見た目なら、送った
 * 人はどちらだったか分からないまま終わる。 */

/** 待っている 1 通が、読み手から見てどうなっているか。 */
export type WaitingState = "waiting" | "expired" | "dropped";

/** 画面が出す 1 通。中身は契約の行そのままで、状態だけこちらが足す。 */
export interface WaitingMessage {
  readonly message: InboxMessage;
  readonly state: WaitingState;
}

/** 行を照合する鍵。契約が「行は自分の鍵で照合される」と言う、その鍵。 */
export function inboxKey(element: InboxElement): string {
  return element.mid;
}

function isRemoved(element: InboxElement): element is InboxRemoved {
  return (element as InboxRemoved).removed === true;
}

/** 届かなかった 1 通を覚え直す。
 *
 * 消えた frame には本文が無い (あるのは `mid` と理由だけ) ので、待っていた間に
 * 聞いた行から本文を取る。畳みが行を落とす前に呼ぶ — 落ちた後では、何が
 * 期限切れになったのかを言えない。
 *
 * `delivered` は覚えない。相手が受け取ったものは相手の transcript が正本で、
 * ここに残せば同じ 1 通が 2 か所に出る。 */
export function rememberDepartures(
  held: readonly WaitingMessage[],
  waiting: readonly InboxMessage[],
  elements: readonly InboxElement[],
  limit: number,
): readonly WaitingMessage[] {
  let next = held;
  for (const element of elements) {
    if (!isRemoved(element)) continue;
    if (element.reason === "delivered") {
      next = next.filter((one) => one.message.mid !== element.mid);
      continue;
    }
    const body = waiting.find((one) => one.mid === element.mid);
    if (body === undefined) continue;
    next = [
      ...next.filter((one) => one.message.mid !== element.mid),
      { message: body, state: element.reason },
    ].slice(-limit);
  }
  return next;
}

/** そのセッション宛ての分だけを、言われた順に。
 *
 * 待っている分と届かなかった分を 1 つの並びにするのは、読み手にとって順番が
 * 「いつ言ったか」で決まるから — 状態は行の印であって、並びを分ける理由では
 * ない。 */
export function waitingFor(
  waiting: readonly InboxMessage[],
  gone: readonly WaitingMessage[],
  sid: Sid,
): readonly WaitingMessage[] {
  const held: WaitingMessage[] = [];
  for (const message of waiting) {
    if (message.to === sid) held.push({ message, state: "waiting" });
  }
  for (const one of gone) {
    if (one.message.to === sid) held.push(one);
  }
  return held.sort((a, b) => a.message.sent_at - b.message.sent_at);
}

/** 相手ごとの、まだ待っている通数。一覧のバッジはこれを読む。
 *
 * 数えるのは待っている分だけ。届かなかった分は待っていないので、一覧で
 * 「返事待ち」として数えると、いつまでも減らない数になる。 */
export function waitingCounts(waiting: readonly InboxMessage[]): ReadonlyMap<Sid, number> {
  const counts = new Map<Sid, number>();
  for (const one of waiting) {
    if (one.to === undefined) continue;
    counts.set(one.to, (counts.get(one.to) ?? 0) + 1);
  }
  return counts;
}
