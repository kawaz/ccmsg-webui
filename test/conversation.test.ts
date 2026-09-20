// 会話の周辺にある純関数 — 打鍵の判定、送信結果の文言、下書きの鍵。
import { describe, expect, test } from "bun:test";
import { composerAction } from "../src/conversation/composer-keydown.ts";
import { draftKey } from "../src/conversation/draft.ts";
import { afterSend, describeSendOutcome } from "../src/conversation/send-outcome.ts";

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

describe("afterSend", () => {
  // 積まれたのは契約では成功なので、下書きは届いた時と同じく手放す。違うのは
  // 窓で、渡らなかった理由を読む所が要るので開けたままにする。
  test("届いた時だけ窓を閉じる", () => {
    expect(afterSend({ delivered: true })).toEqual({ outcome: "届きました。", closes: true });
  });

  test("積まれた時は閉じず、理由をそのまま出す", () => {
    const next = afterSend({ delivered: false, reason: "paused" });
    expect(next.closes).toBe(false);
    expect(next.outcome).toBe(describeSendOutcome({ delivered: false, reason: "paused" }));
  });
});

describe("draftKey", () => {
  test("instance と sid の両方で鍵を分ける", () => {
    expect(draftKey("ws://a", "s1")).toBe("ccmsg.draft:ws://a:s1");
    expect(draftKey("ws://a", "s1")).not.toBe(draftKey("ws://b", "s1"));
  });
});
