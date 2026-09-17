import { describe, expect, test } from "bun:test";
import { keyGate, type KeyLike } from "../src/actions/ime.ts";

/** 変換中の打鍵をアクションに流さない (DR-0003 §2.5)。
 *
 * **合成したイベントで確かめる** — `page.keyboard` では IME を再現できないので、
 * 実機の絵ではここを固定できない。 */

function key(code: string, part: Partial<KeyLike> = {}): KeyLike {
  return { code, isComposing: false, keyCode: 0, ...part };
}

describe("変換中の打鍵は受けない", () => {
  test("`isComposing` が立っている打鍵は流さない", () => {
    const gate = keyGate();
    expect(gate.accepts(key("Enter", { isComposing: true }))).toBe(false);
    expect(gate.accepts(key("Escape", { isComposing: true }))).toBe(false);
    expect(gate.accepts(key("ArrowDown", { isComposing: true }))).toBe(false);
  });

  test("`isComposing` を立てない経路の 229 も流さない", () => {
    const gate = keyGate();
    expect(gate.accepts(key("Enter", { keyCode: 229 }))).toBe(false);
  });

  test("変換していない打鍵はそのまま通る", () => {
    const gate = keyGate();
    expect(gate.accepts(key("Enter"))).toBe(true);
    expect(gate.accepts(key("Slash"))).toBe(true);
  });
});

describe("Safari 型 — 確定の Enter は compositionend の後に届く", () => {
  test("確定した直後の Enter は流さない", () => {
    const gate = keyGate();
    gate.composed();
    expect(gate.accepts(key("Enter"))).toBe(false);
  });

  test("確定を取り消した直後の Escape も流さない", () => {
    const gate = keyGate();
    gate.composed();
    expect(gate.accepts(key("Escape"))).toBe(false);
  });

  test("印が効くのは直後の 1 回だけ — 次の Enter は本物", () => {
    const gate = keyGate();
    gate.composed();
    expect(gate.accepts(key("Enter"))).toBe(false);
    expect(gate.accepts(key("Enter"))).toBe(true);
  });

  test("確定の直後でも、確定と関係の無い打鍵は通る", () => {
    const gate = keyGate();
    gate.composed();
    // 印はここで消える (最初に見た打鍵で消すので、次の Enter は本物になる)。
    expect(gate.accepts(key("ArrowDown"))).toBe(true);
    expect(gate.accepts(key("Enter"))).toBe(true);
  });
});

describe("同じ打鍵を 2 人が訊く", () => {
  test("入力欄の中と区画の外で、同じ答えが返る", () => {
    const gate = keyGate();
    gate.composed();
    const settled = key("Enter");
    // composer (target) が先に訊き、window が後から訊く。1 回目で印を消して
    // しまうと、2 人目には確定の打鍵が本物の Enter に見える。
    expect(gate.accepts(settled)).toBe(false);
    expect(gate.accepts(settled)).toBe(false);
    // 別の打鍵になれば、そこからは普通に読む。
    expect(gate.accepts(key("Enter"))).toBe(true);
  });
});
