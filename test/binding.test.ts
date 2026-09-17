import { describe, expect, test } from "bun:test";
import {
  appliesTo,
  type Binding,
  bindingWorks,
  checkBinding,
  displayBinding,
  formatBinding,
  isFailure,
  parseBinding,
  resolveBinding,
  resolvedKey,
} from "../src/actions/binding.ts";

/** 打鍵の綴りと、その 3 つの姿 (DR-0003 §2.5)。 */

function read(spell: string): Binding {
  const held = parseBinding(spell);
  if (isFailure(held)) throw new Error(held.problem);
  return held;
}

describe("綴りを読む", () => {
  test("順序と重複は集合で正規化される", () => {
    expect(formatBinding(read("Shift+CmdOrCtrl+KeyK"))).toBe("CmdOrCtrl+Shift+KeyK");
    expect(formatBinding(read("CmdOrCtrl+Shift+KeyK"))).toBe("CmdOrCtrl+Shift+KeyK");
  });

  test("大文字小文字は問わず、別名は正規形へ戻る", () => {
    expect(formatBinding(read("command+option+keyk"))).toBe("Cmd+Alt+KeyK");
    expect(formatBinding(read("CommandOrControl+KeyK"))).toBe("CmdOrCtrl+KeyK");
  });

  test("CmdOrCtrl と、その解決先を一緒には書けない", () => {
    const held = parseBinding("CmdOrCtrl+Cmd+KeyK");
    expect(isFailure(held)).toBe(true);
  });

  test("知らない修飾子は推測せずに断る", () => {
    const held = parseBinding("Mod+KeyK");
    expect(isFailure(held) && held.problem).toContain("CmdOrCtrl");
  });

  test("キーが無い綴りは断る", () => {
    expect(isFailure(parseBinding(""))).toBe(true);
  });
});

describe("platform に解決する", () => {
  test("CmdOrCtrl は 1 つの修飾子に置き換わる (論理和ではない)", () => {
    const binding = read("CmdOrCtrl+KeyK");
    expect(resolveBinding(binding, "mac")).toEqual({
      code: "KeyK",
      meta: true,
      ctrl: false,
      alt: false,
      shift: false,
    });
    expect(resolveBinding(binding, "other")).toEqual({
      code: "KeyK",
      meta: false,
      ctrl: true,
      alt: false,
      shift: false,
    });
  });

  test("個別指定はどの platform でもそのキー", () => {
    expect(resolveBinding(read("Ctrl+KeyF"), "mac").ctrl).toBe(true);
    expect(resolveBinding(read("Ctrl+KeyF"), "mac").meta).toBe(false);
  });
});

describe("画面に見せる表記", () => {
  test("mac は記号を繋げ、それ以外は語を + で結ぶ", () => {
    const binding = read("CmdOrCtrl+Shift+KeyK");
    expect(displayBinding(binding, "mac")).toBe("⇧⌘K");
    expect(displayBinding(binding, "other")).toBe("Ctrl+Shift+K");
  });

  test("記号の並びは ⌃⌥⇧⌘ の順", () => {
    expect(displayBinding(read("Ctrl+Alt+Shift+Cmd+KeyK"), "mac")).toBe("⌃⌥⇧⌘K");
  });

  test("刻印のあるキーは刻印で出る", () => {
    expect(displayBinding(read("Cmd+BracketLeft"), "mac")).toBe("⌘[");
    expect(displayBinding(read("ArrowUp"), "other")).toBe("↑");
  });
});

describe("platform 限定", () => {
  test("限定した platform でだけ有効", () => {
    const binding: Binding = { ...read("Ctrl+KeyF"), only: "mac" };
    expect(appliesTo(binding, "mac")).toBe(true);
    expect(appliesTo(binding, "other")).toBe(false);
  });

  test("限定は検査より先に効く — mac の Ctrl+F はページ内検索と被らない", () => {
    const binding: Binding = { ...read("Ctrl+KeyF"), only: "mac" };
    expect(checkBinding(binding, "mac").at).toBe("clear");
    expect(bindingWorks(binding, "mac")).toBe(true);
    expect(bindingWorks(binding, "other")).toBe(false);
  });
});

describe("警告と予約", () => {
  test("奪えてしまうものは警告で、何が失われるかを言う", () => {
    const verdict = checkBinding(read("CmdOrCtrl+KeyF"), "mac");
    expect(verdict.at).toBe("warned");
    expect(verdict.at === "warned" && verdict.lost).toContain("検索");
  });

  test("警告は force で通る", () => {
    const binding = read("CmdOrCtrl+KeyF");
    expect(bindingWorks(binding, "mac")).toBe(false);
    expect(bindingWorks({ ...binding, force: true }, "mac")).toBe(true);
  });

  test("予約は force でも効かない", () => {
    const binding = read("CmdOrCtrl+KeyW");
    expect(checkBinding(binding, "mac").at).toBe("reserved");
    expect(bindingWorks({ ...binding, force: true }, "mac")).toBe(false);
  });

  test("予約は platform ごとに違う集合で、同じ綴りでも解決先で決まる", () => {
    // `CmdOrCtrl+KeyW` は mac で ⌘W、それ以外で Ctrl+W。Chromium はどちらでも
    // タブを閉じる手として予約する (DR-0003 §2.5 の出典)。
    expect(checkBinding(read("CmdOrCtrl+KeyW"), "mac").at).toBe("reserved");
    expect(checkBinding(read("CmdOrCtrl+KeyW"), "other").at).toBe("reserved");
    // Safari だけが取るものは mac でだけ予約。Windows / Linux の Ctrl+L は
    // ブラウザの手を奪うが、ページには届く。
    expect(checkBinding(read("CmdOrCtrl+KeyL"), "mac").at).toBe("reserved");
    expect(checkBinding(read("CmdOrCtrl+KeyL"), "other").at).toBe("warned");
  });

  test("ブラウザの手に触らない組み合わせはそのまま通る", () => {
    expect(checkBinding(read("CmdOrCtrl+Shift+KeyK"), "mac").at).toBe("clear");
    expect(bindingWorks(read("CmdOrCtrl+Shift+KeyK"), "mac")).toBe(true);
  });
});

describe("照合の鍵", () => {
  test("解決後の姿が同じなら同じ鍵になる", () => {
    expect(resolvedKey(resolveBinding(read("CmdOrCtrl+KeyK"), "mac"))).toBe(
      resolvedKey(resolveBinding(read("Cmd+KeyK"), "mac")),
    );
  });

  test("修飾が無い打鍵の鍵は code そのもの", () => {
    expect(resolvedKey(resolveBinding(read("ArrowDown"), "mac"))).toBe("ArrowDown");
  });
});
