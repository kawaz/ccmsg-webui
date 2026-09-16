import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { contrast, type Oklch } from "../src/color/oklch.ts";

/** 段表がコントラストの基準を満たしているかを、**CSS を正本にして**測る。
 *
 * 値を持っているのは `app.css` の層 0 と層 1 なので、ここはそれを読んで解く。
 * 数をこちらにも書くと、片方を直した時にもう片方が古いまま「通る」ことになる。
 *
 * 比そのものは CSS の式では書けない (WCAG 2 の比は最終的な sRGB の輝度で決まる)
 * ので、検査はここにある。 */

const CSS = readFileSync(new URL("../src/app.css", import.meta.url), "utf8");

/** ある規則の本文を字面から取る。 */
function block(from: string): string {
  const at = CSS.indexOf(from);
  if (at < 0) throw new Error(`${from} が見つかりません`);
  return CSS.slice(at, CSS.indexOf("\n}", at));
}

/** 値は light も dark も `:root` にある — dark は `--dark-*` という別の名前で
 * 同じ所に書いてあり、face の規則はそれを採るだけ (DR-0001 §2.4)。 */
const ROOT = block(":root {");

function value(name: string): number {
  const said = new RegExp(`--${name}:\\s*([0-9.]+)\\s*;`).exec(ROOT);
  if (said === null) throw new Error(`${name} が読めません`);
  return Number(said[1]);
}

/** face ごとの名前。dark は `--dark-` を冠した方を読む。 */
function faced(dark: boolean, name: string): number {
  return value(dark ? `dark-${name}` : name);
}

/** 段表。face で違うのは L の行だけで、C 係数は共通。 */
function steps(dark: boolean): { l: (step: number) => number; c: (step: number) => number } {
  return {
    l: (step) => faced(dark, `l-${String(step)}`),
    c: (step) => value(`c-${String(step)}`),
  };
}

const hue = value;

/** 入力の C と h。brand だけは色として書いてあるので、その中から読む。 */
function brand(dark: boolean): { c: number; h: number } {
  const name = dark ? "dark-brand" : "brand";
  const said = new RegExp(`--${name}:\\s*oklch\\([0-9.]+\\s+([0-9.]+)\\s+([0-9.]+)\\)`).exec(ROOT);
  if (said === null) throw new Error(`${name} が読めません`);
  return { c: Number(said[1]), h: Number(said[2]) };
}

/** ある面の、ある段の色。 */
function step(dark: boolean, n: number, chroma: number, h: number): Oklch {
  const table = steps(dark);
  return { l: table.l(n), c: chroma * table.c(n), h };
}

const NEUTRAL = { c: () => value("neutral-c"), h: () => hue("neutral-h") };
const SEMANTIC = ["info", "success", "warning", "danger"] as const;

/** 文字と罫が乗る面 = 段 1〜3。いちばん厳しい組を測る。 */
const GROUNDS = [1, 2, 3];

for (const dark of [false, true]) {
  const face = dark ? "dark" : "light";
  describe(`${face} の段表`, () => {
    const ground = (n: number): Oklch => step(dark, n, NEUTRAL.c(), NEUTRAL.h());

    test("本文 (段 12) は地と面の上で 4.5 以上", () => {
      const fg = step(dark, 12, NEUTRAL.c(), NEUTRAL.h());
      for (const n of GROUNDS) expect(contrast(fg, ground(n))).toBeGreaterThanOrEqual(4.5);
    });

    test("弱い文字 (段 11) は中立でも意味色でも 4.5 以上", () => {
      const families: Oklch[] = [
        step(dark, 11, NEUTRAL.c(), NEUTRAL.h()),
        step(dark, 11, brand(dark).c, brand(dark).h),
        ...SEMANTIC.map((name) => step(dark, 11, value("semantic-c"), hue(`h-${name}`))),
      ];
      for (const color of families) {
        for (const n of GROUNDS) expect(contrast(color, ground(n))).toBeGreaterThanOrEqual(4.5);
      }
    });

    test("罫 (段 7・8) は地と面の上で 3.0 以上", () => {
      for (const n of [7, 8]) {
        const line = step(dark, n, NEUTRAL.c(), NEUTRAL.h());
        for (const on of GROUNDS) expect(contrast(line, ground(on))).toBeGreaterThanOrEqual(3.0);
      }
    });

    test("塗り (段 9) の上に乗る文字は 4.5 以上", () => {
      const onFill = step(dark, 1, 0, NEUTRAL.h());
      const fills: Oklch[] = [
        step(dark, 9, NEUTRAL.c(), NEUTRAL.h()),
        step(dark, 9, brand(dark).c, brand(dark).h),
        ...SEMANTIC.map((name) => step(dark, 9, value("semantic-c"), hue(`h-${name}`))),
      ];
      for (const fill of fills) expect(contrast(onFill, fill)).toBeGreaterThanOrEqual(4.5);
    });

    test("識別の族の上に乗る文字は 4.5 以上", () => {
      const l = faced(dark, "tag-l");
      const c = faced(dark, "tag-c");
      const h0 = hue("tag-h0");
      const stepH = hue("tag-step");
      const onTag: Oklch = { l: faced(dark, "on-tag-l"), c: 0, h: NEUTRAL.h() };
      for (let n = 0; n < 6; n += 1) {
        expect(contrast(onTag, { l, c, h: h0 + n * stepH })).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
}

/** dark を採る規則は 2 つある (OS が dark で人が light を選んでいない / 人が
 * dark を選んだ)。**値はどちらも持たず** `--dark-*` を採るだけなので、揃って
 * いないことがあるとすれば「片方に足し忘れた」時 — それをここで見る。 */
describe("dark を採る 2 つの規則", () => {
  const names = (rule: string): string[] =>
    [...block(rule).matchAll(/(--[a-z0-9-]+):/g)].map((found) => found[1] as string).sort();

  test("同じ名前を並べている", () => {
    expect(names(':root[data-theme="dark"] {')).toEqual(names(':root:not([data-theme="light"]) {'));
  });

  test("並んでいるのは段表と入力の全部で、値は持たない", () => {
    const adopted = names(':root[data-theme="dark"] {');
    for (const name of adopted) {
      expect(block(':root[data-theme="dark"] {')).toContain(
        `${name}: var(--dark-${name.slice(2)})`,
      );
    }
    // `--dark-*` の側に、どこからも採られていないものが残っていない。
    const offered = [...ROOT.matchAll(/--dark-([a-z0-9-]+):/g)].map((found) => found[1] as string);
    expect(offered.map((name) => `--${name}`).sort()).toEqual(adopted);
  });
});
