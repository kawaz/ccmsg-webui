// inbox の畳みと、待っている 1 通の読み方。
import { describe, expect, test } from "bun:test";
import type { InboxElement, InboxMessage, Sid } from "@ccmsg/protocol";
import { INBOX_FRAME, INBOX_REMOVED_FRAME } from "@ccmsg/protocol/fixtures";
import {
  inboxKey,
  rememberDepartures,
  type WaitingMessage,
  waitingCounts,
  waitingFor,
} from "../src/conversation/inbox.ts";
import { ElementFold, rows } from "../src/topic-fold.ts";

const INSTANCE = "i1";

/** fixture の frame は element の並び (= 行と消滅の union) なので、行として
 * 読む test はここで行だけを取る。 */
const MESSAGES = INBOX_FRAME.data.filter((one) => !("removed" in one)) as readonly InboxMessage[];

function fold(): ElementFold<InboxElement, InboxMessage> {
  return new ElementFold<InboxElement, InboxMessage>("inbox", inboxKey);
}

describe("inbox の畳み", () => {
  test("契約の fixture がそのまま畳める", () => {
    const held = fold();
    held.push(INSTANCE, INBOX_FRAME.data, true);
    const waiting = rows(held.slots);
    expect(waiting.map((one) => one.mid)).toEqual(MESSAGES.map((one) => one.mid));
    // 人が読む行は宛先を名乗る — どのセッションの inbox かは行にしか書いていない。
    expect(waiting.every((one) => one.to !== undefined)).toBe(true);
  });

  test("消えた 1 通は行として落ちる", () => {
    const held = fold();
    held.push(INSTANCE, INBOX_FRAME.data, true);
    held.push(INSTANCE, INBOX_REMOVED_FRAME.data, false);
    expect(rows(held.slots)).toEqual([]);
  });
});

describe("届かなかった 1 通", () => {
  const waiting = MESSAGES;
  const [first, second] = waiting as [InboxMessage, InboxMessage];

  test("渡ったものは覚えず、届かなかったものだけ理由付きで覚える", () => {
    const gone = rememberDepartures([], waiting, INBOX_REMOVED_FRAME.data, 50);
    // fixture は 1 通目が delivered、2 通目が expired。
    expect(gone.map((one) => [one.message.mid, one.state])).toEqual([[second.mid, "expired"]]);
  });

  test("渡ったと言われたら、覚えていた分も下ろす", () => {
    const held: readonly WaitingMessage[] = [{ message: first, state: "dropped" }];
    const gone = rememberDepartures(
      held,
      [],
      [{ mid: first.mid, removed: true, reason: "delivered" }],
      50,
    );
    expect(gone).toEqual([]);
  });

  test("本文を聞いていない 1 通は覚えられない", () => {
    const gone = rememberDepartures(
      [],
      [],
      [{ mid: first.mid, removed: true, reason: "expired" }],
      50,
    );
    expect(gone).toEqual([]);
  });

  test("上限を超えたら古い方から手放す", () => {
    const gone = rememberDepartures(
      [{ message: first, state: "expired" }],
      waiting,
      [{ mid: second.mid, removed: true, reason: "dropped" }],
      1,
    );
    expect(gone.map((one) => one.message.mid)).toEqual([second.mid]);
  });
});

describe("そのセッション宛ての 1 通たち", () => {
  const sid = MESSAGES[0]?.to as Sid;
  const other = "9f1a2b3c-4d5e-4f60-8a91-b2c3d4e5f600" as Sid;

  test("待っている分と届かなかった分が、言われた順に 1 つの並びになる", () => {
    const [first, second] = MESSAGES as [InboxMessage, InboxMessage];
    const held = waitingFor([second], [{ message: first, state: "expired" }], sid);
    expect(held.map((one) => [one.message.mid, one.state])).toEqual([
      [first.mid, "expired"],
      [second.mid, "waiting"],
    ]);
  });

  test("他のセッション宛ては混ざらない", () => {
    expect(waitingFor(MESSAGES, [], other)).toEqual([]);
  });

  test("数えるのは待っている分だけ", () => {
    expect([...waitingCounts(MESSAGES)]).toEqual([[sid, 2]]);
    expect([...waitingCounts([{ ...(MESSAGES[0] as InboxMessage), to: undefined }])]).toEqual([]);
  });
});
