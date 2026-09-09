import type { MessageSendResult, Sid } from "@ccmsg/protocol";

/** この画面から送って、相手にまだ渡っていない 1 通。
 *
 * 契約では `delivered: false` は失敗ではなく「instance が受け取り、相手の
 * inbox で待っている」という成功なので、送った文はどこにも失敗として残らない。
 * 残らないと、送った人は「何を待たせているか」を覚えていられない — それを
 * 覚えているのがここ。
 *
 * **これは instance の inbox の写しではない。** 人としてつないだ接続は
 * `inbox` を購読できるが、frame は 1 つも来ない (実機で確認、v0.0.29): topic
 * が運ぶのは「そのセッションに宛てて言われたこと」で、人はセッションではない。
 * だからここが持てるのは「この画面が送ったもの」だけで、他の誰かが送った分も、
 * 相手にいつ渡ったかも、ここには出せない。 */
export interface HeldMessage {
  /** この一覧の中だけの名前。同じ相手に同じ文を 2 度送っても別の 1 通。 */
  readonly key: number;
  readonly sid: Sid;
  readonly text: string;
  /** instance が言った、まだ渡っていない理由。 */
  readonly reason: MessageSendResult["reason"];
  readonly at: number;
}

let counter = 0;

/** 送った結果を 1 通として記録する。渡ったのなら何も残さない。 */
export function heldFromSend(
  sid: Sid,
  text: string,
  result: MessageSendResult,
  at: number = Date.now(),
): HeldMessage | undefined {
  if (result.delivered) return undefined;
  counter += 1;
  return { key: counter, sid, text, reason: result.reason, at };
}

/** ある相手宛てに待っているものだけ、送った順に。 */
export function heldFor(held: readonly HeldMessage[], sid: Sid): readonly HeldMessage[] {
  return held.filter((one) => one.sid === sid);
}

/** 相手ごとの数。一覧のバッジはこれを読む。 */
export function heldCounts(held: readonly HeldMessage[]): ReadonlyMap<Sid, number> {
  const counts = new Map<Sid, number>();
  for (const one of held) counts.set(one.sid, (counts.get(one.sid) ?? 0) + 1);
  return counts;
}
