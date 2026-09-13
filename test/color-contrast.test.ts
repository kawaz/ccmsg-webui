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

/** `:root { … }` と dark の上書きブロックを、それぞれ字面から取る。 */
function block(from: string): string {
  const at = CSS.indexOf(from);
  return CSS.slice(at, CSS.indexOf("\n}", at));
}

const LIGHT = block(":root {");
const DARK = block("@media (prefers-color-scheme: dark) {");

function value(name: string, scope: string): number {
  const said = new RegExp(`--${name}:\\s*([0-9.]+)\\s*;`).exec(scope);
  if (said === null) throw new Error(`${name} が読めません`);
  return Number(said[1]);
}

/** 段表。dark は L の行だけを上書きする (上書きが無ければ light の値)。 */
function steps(dark: boolean): { l: (step: number) => number; c: (step: number) => number } {
  return {
    l: (step) => {
      const name = `l-${String(step)}`;
      return dark && DARK.includes(`--${name}:`) ? value(name, DARK) : value(name, LIGHT);
    },
    c: (step) => value(`c-${String(step)}`, LIGHT),
  };
}

function hue(name: string): number {
  return value(name, LIGHT);
}

/** 入力の C。brand だけは色として書いてあるので、その C を読む。 */
function brandChroma(): number {
  const said = /--brand:\s*oklch\([0-9.]+\s+([0-9.]+)\s+([0-9.]+)\)/.exec(LIGHT);
  if (said === null) throw new Error("brand が読めません");
  return Number(said[1]);
}

function brandHue(): number {
  const said = /--brand:\s*oklch\([0-9.]+\s+[0-9.]+\s+([0-9.]+)\)/.exec(LIGHT);
  if (said === null) throw new Error("brand が読めません");
  return Number(said[1]);
}

/** ある面の、ある段の色。 */
function step(dark: boolean, n: number, chroma: number, h: number): Oklch {
  const table = steps(dark);
  return { l: table.l(n), c: chroma * table.c(n), h };
}

const NEUTRAL = { c: () => value("neutral-c", LIGHT), h: () => hue("neutral-h") };
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
        step(dark, 11, brandChroma(), brandHue()),
        ...SEMANTIC.map((name) => step(dark, 11, value("semantic-c", LIGHT), hue(`h-${name}`))),
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
        step(dark, 9, brandChroma(), brandHue()),
        ...SEMANTIC.map((name) => step(dark, 9, value("semantic-c", LIGHT), hue(`h-${name}`))),
      ];
      for (const fill of fills) expect(contrast(onFill, fill)).toBeGreaterThanOrEqual(4.5);
    });

    test("識別の族の上に乗る文字は 4.5 以上", () => {
      const scope = dark && DARK.includes("--tag-l:") ? DARK : LIGHT;
      const l = value("tag-l", scope);
      const c = value("tag-c", scope);
      const h0 = hue("tag-h0");
      const stepH = hue("tag-step");
      const onTag: Oklch = { l: dark ? value("l-1", DARK) : 0.27, c: 0, h: NEUTRAL.h() };
      for (let n = 0; n < 6; n += 1) {
        expect(contrast(onTag, { l, c, h: h0 + n * stepH })).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
}
