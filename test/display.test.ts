// 型ごとの表示属性。固定するのは階層で継ぐことと、覚えていた値が壊れていても
// 画面が立つこと — どちらも、知らない型が増え続ける所で効く。
import { describe, expect, test } from "bun:test";
import {
  clearDisplay,
  type DisplaySettings,
  displayRows,
  displayStorageKey,
  formatDisplaySettings,
  isOwnValue,
  parseDisplaySettings,
  resolveDisplay,
  setDisplay,
  type Subject,
  typeAncestry,
} from "../src/timeline/display.ts";

/** 面 1 つ。主語を書かずに設定だけ渡している所は main の面として読む。 */
function face(settings: DisplaySettings, subject: Subject = "main") {
  return { subject, settings };
}

describe("階層で継ぐ", () => {
  test("何も付いていない型は組み込みの既定に落ちる", () => {
    expect(resolveDisplay(face({}), "message.user.in")).toEqual({ top: true, open: true });
    expect(resolveDisplay(face({}), "thinking")).toEqual({ top: true, open: true });
    expect(resolveDisplay(face({}), "tool.Bash")).toEqual({ top: false, open: false });
    // 組み込みが名乗っていない根も、根の既定で必ず答えが出る。
    expect(resolveDisplay(face({}), "hook.PreToolUse")).toEqual({ top: false, open: false });
  });

  test("上の型に付けた値が配下に効く", () => {
    const settings = { tool: { open: true } };
    expect(resolveDisplay(face(settings), "tool.Bash").open).toBe(true);
    expect(resolveDisplay(face(settings), "tool.Read").open).toBe(true);
    // 付けていない軸は組み込みのまま。
    expect(resolveDisplay(face(settings), "tool.Bash").top).toBe(false);
  });

  test("近い型に付けた値が、上の型より優先される", () => {
    const settings = { tool: { open: true }, "tool.Read": { open: false } };
    expect(resolveDisplay(face(settings), "tool.Read").open).toBe(false);
    expect(resolveDisplay(face(settings), "tool.Bash").open).toBe(true);
  });

  test("組み込みより、読み手が付けた値が強い", () => {
    expect(resolveDisplay(face({ message: { top: false } }), "message.user.in").top).toBe(false);
  });

  test("その型そのものに付いた値だけが「自分のもの」", () => {
    const settings = setDisplay({}, "tool", "open", true);
    expect(isOwnValue(settings, "tool", "open")).toBe(true);
    expect(isOwnValue(settings, "tool.Bash", "open")).toBe(false);
    expect(isOwnValue(settings, "tool", "top")).toBe(false);
  });

  test("外すと、また上の型か組み込みが答える", () => {
    const settings = setDisplay({ tool: { open: true } }, "tool.Read", "open", false);
    expect(resolveDisplay(face(clearDisplay(settings, "tool.Read")), "tool.Read").open).toBe(true);
  });

  // 主語が違えば、同じ型の同じ軸が違う答えになる。main は会話を読む画面なので
  // 道具は畳みの中、sub はやり方を読む画面なので道具がトップ層に 1 行ずつ並ぶ。
  test("組み込みの既定は主語ごと", () => {
    expect(resolveDisplay(face({}, "main"), "tool.Bash")).toEqual({ top: false, open: false });
    expect(resolveDisplay(face({}, "sub"), "tool.Bash")).toEqual({ top: true, open: false });
    expect(resolveDisplay(face({}, "sub"), "thinking")).toEqual({ top: true, open: false });
    expect(resolveDisplay(face({}, "sub"), "message.user.in")).toEqual({ top: true, open: true });
  });

  // 契約に会話の型が増えても、表に行を足さずに `message` の階層が受ける。worker
  // の画面でも、親からの指示書と親への回答は会話として本文ごと立つ。
  test("会話の新しい型は message の階層が受ける", () => {
    for (const type of ["message.parent.in", "message.parent.out", "message.team.in"]) {
      expect(resolveDisplay(face({}, "main"), type)).toEqual({ top: true, open: true });
      expect(resolveDisplay(face({}, "sub"), type)).toEqual({ top: true, open: true });
    }
  });

  test("付けた値は面をまたがない (設定が別なら答えも別)", () => {
    const settings = { "tool.Bash": { top: false } };
    expect(resolveDisplay(face(settings, "sub"), "tool.Bash").top).toBe(false);
    expect(resolveDisplay(face({}, "sub"), "tool.Bash").top).toBe(true);
  });

  test("型と、その型を含む上の型", () => {
    expect(typeAncestry("system.attachment.environment")).toEqual([
      "system.attachment.environment",
      "system.attachment",
      "system",
    ]);
    expect(typeAncestry("thinking")).toEqual(["thinking"]);
  });
});

describe("設定画面に並べる型", () => {
  test("組み込みの型と、見た型とその上の型が並ぶ", () => {
    expect(displayRows(face({}), ["tool.Bash"])).toEqual([
      "message",
      "thinking",
      "tool",
      "tool.Bash",
    ]);
  });

  test("もう見ていない型でも、値が付いていれば並ぶ", () => {
    expect(displayRows(face({ "hook.SessionStart": { top: true } }), [])).toContain(
      "hook.SessionStart",
    );
  });
});

describe("覚えておく所", () => {
  // 読み方はこの人のものなので、どの instance のどのセッションを見ているかは
  // 鍵に入らない。分かれるのは主語の面だけ。
  test("鍵は面だけで分かれる", () => {
    expect(displayStorageKey("main")).toBe("ccmsg.timeline.display:main");
    expect(displayStorageKey("main")).not.toBe(displayStorageKey("sub"));
  });

  test("書いた形がそのまま読み戻せる", () => {
    const settings = { "tool.Bash": { top: true, open: false } };
    expect(parseDisplaySettings(formatDisplaySettings(settings))).toEqual(settings);
  });

  test("値が無い・読めない所は、組み込みの既定のまま立つ", () => {
    expect(parseDisplaySettings(null)).toEqual({});
    expect(parseDisplaySettings(undefined)).toEqual({});
    expect(parseDisplaySettings("not json")).toEqual({});
    expect(parseDisplaySettings("42")).toEqual({});
    expect(parseDisplaySettings("[]")).toEqual({});
  });

  test("壊れた entry はその entry だけ捨てる", () => {
    const raw = JSON.stringify({
      "tool.Bash": { top: true, open: "はい" },
      "tool.Read": { top: "いいえ" },
      大文字ダメ: { top: true },
      thinking: { open: false },
    });
    expect(parseDisplaySettings(raw)).toEqual({
      "tool.Bash": { top: true },
      thinking: { open: false },
    });
  });
});
