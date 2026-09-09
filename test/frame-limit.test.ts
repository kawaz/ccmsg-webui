// 送る側が守る 1 行の上限。
import { describe, expect, test } from "bun:test";
import { MAX_FRAME_BYTES } from "@ccmsg/protocol";
import { frameByteLength, oversizeReason } from "../src/frame-limit.ts";

describe("送る前に測る", () => {
  test("収まっていれば止めず、超えたら大きさを言って止める", () => {
    const fits = { op: "message_send", request_id: "1", to: "s1", text: "こんにちは" };
    expect(oversizeReason(frameByteLength(fits))).toBeUndefined();

    const over = { ...fits, text: "あ".repeat(MAX_FRAME_BYTES) };
    const bytes = frameByteLength(over);
    expect(bytes).toBeGreaterThan(MAX_FRAME_BYTES);
    expect(oversizeReason(bytes)).toContain(bytes.toLocaleString());
  });

  test("byte で測る — 文字数では収まっていても超えることがある", () => {
    expect(frameByteLength({ text: "あ" })).toBeGreaterThan(frameByteLength({ text: "a" }));
  });
});
