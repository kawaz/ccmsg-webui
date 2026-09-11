// 会話の周辺にある純関数 — 打鍵の判定、送信結果の文言、下書きの鍵。
import { describe, expect, test } from "bun:test";
import { composerAction } from "../src/conversation/composer-keydown.ts";
import { draftKey } from "../src/conversation/draft.ts";
import { heldCounts, heldFor, heldFromSend } from "../src/conversation/held-messages.ts";
import { describeSendOutcome } from "../src/conversation/send-outcome.ts";

const KEY = {
  key: "Enter",
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  isComposing: false,
};

describe("composerAction", () => {
  test("Enter は改行、Shift+Enter も改行", () => {
    expect(composerAction(KEY)).toBe("newline");
    expect(composerAction({ ...KEY, shiftKey: true })).toBe("newline");
  });

  test("⌘Enter と Ctrl+Enter が送信", () => {
    expect(composerAction({ ...KEY, metaKey: true })).toBe("send");
    expect(composerAction({ ...KEY, ctrlKey: true })).toBe("send");
  });

  test("変換確定中は、修飾キーが付いていても送らない", () => {
    expect(composerAction({ ...KEY, isComposing: true })).toBe("ignore");
    expect(composerAction({ ...KEY, isComposing: true, metaKey: true })).toBe("ignore");
  });

  test("Enter 以外の打鍵は何もしない", () => {
    expect(composerAction({ ...KEY, key: "a" })).toBe("ignore");
  });
});

describe("describeSendOutcome", () => {
  test("届いたときは届いたと言う", () => {
    expect(describeSendOutcome({ delivered: true })).toBe("届きました。");
  });

  test("積まれたときは理由ごとに、次にどうするかを言う", () => {
    expect(describeSendOutcome({ delivered: false, reason: "paused" })).toContain("inbox");
    expect(describeSendOutcome({ delivered: false, reason: "inbox_full" })).toContain("古い");
  });

  test("理由が無い積みも成功として読める文になる", () => {
    expect(describeSendOutcome({ delivered: false })).toBe("inbox に積みました。");
  });

  test("代わりに送れるセッションがあれば添える", () => {
    const text = describeSendOutcome({
      delivered: false,
      reason: "disappeared",
      candidates: [{ sid: "1111", ws: "main", instance: "ws://127.0.0.1:39847" }],
    });
    expect(text).toContain("main");
  });
});

describe("draftKey", () => {
  test("instance と sid の両方で鍵を分ける", () => {
    expect(draftKey("ws://a", "s1")).toBe("ccmsg.draft:ws://a:s1");
    expect(draftKey("ws://a", "s1")).not.toBe(draftKey("ws://b", "s1"));
  });
});

describe("まだ渡っていない 1 通", () => {
  test("届いたものは残さず、積まれたものだけ理由付きで残す", () => {
    expect(heldFromSend("s1", "やあ", { delivered: true })).toBeUndefined();
    const one = heldFromSend("s1", "やあ", { delivered: false, reason: "paused" }, 1000);
    expect(one).toMatchObject({ sid: "s1", text: "やあ", reason: "paused", at: 1000 });
  });

  test("相手ごとに数え、その相手宛だけを取り出せる", () => {
    const held = [
      { key: 1, sid: "s1" as const, text: "a", reason: "paused" as const, at: 1 },
      { key: 2, sid: "s2" as const, text: "b", reason: undefined, at: 2 },
      { key: 3, sid: "s1" as const, text: "c", reason: "throttled" as const, at: 3 },
    ];
    expect([...heldCounts(held)]).toEqual([
      ["s1", 2],
      ["s2", 1],
    ]);
    expect(heldFor(held, "s1").map((one) => one.text)).toEqual(["a", "c"]);
  });
});
