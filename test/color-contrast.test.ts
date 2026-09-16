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

const ROOT = block(":root {");

function value(name: string): number {
  const said = new RegExp(`--${name}:\\s*([0-9.]+)\\s*;`).exec(ROOT);
  if (said === null) throw new Error(`${name} が読めません`);
  return Number(said[1]);
}

/** `light-dark(oklch(…), oklch(…))` の、その face の側。
 *
 * face で値が変わるものはすべてこの形で書いてあるので (DR-0001 §2.4)、読む側も
 * 1 つの読み方で足りる。 */
function faced(name: string, dark: boolean): Oklch {
  const said = new RegExp(
    `--${name}:\\s*light-dark\\(\\s*oklch\\(([^)]*)\\)\\s*,\\s*oklch\\(([^)]*)\\)`,
  ).exec(ROOT);
  if (said === null) throw new Error(`${name} が読めません`);
  const parts = (said[dark ? 2 : 1] as string).split("/")[0] as string;
  const [l, c, h] = parts.trim().split(/\s+/).map(Number) as [number, number, number];
  return { l, c, h };
}

/** 段は明るさだけを持つ。色味は層 2 で載るので、ここで読むのは L。 */
function stepL(step: number, dark: boolean): number {
  return faced(`step-${String(step)}`, dark).l;
}

const hue = value;

/** ある面の、ある段の色。段から明るさを取り、入力の色味を係数で載せる — CSS の
 * 層 2 と同じ組み立て。 */
function step(dark: boolean, n: number, chroma: number, h: number): Oklch {
  return { l: stepL(n, dark), c: chroma * value(`c-${String(n)}`), h };
}

const NEUTRAL = { c: () => value("neutral-c"), h: () => hue("neutral-h") };
const BRAND = { c: () => value("brand-c"), h: () => hue("brand-h") };
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
        step(dark, 11, BRAND.c(), BRAND.h()),
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
        step(dark, 9, BRAND.c(), BRAND.h()),
        ...SEMANTIC.map((name) => step(dark, 9, value("semantic-c"), hue(`h-${name}`))),
      ];
      for (const fill of fills) expect(contrast(onFill, fill)).toBeGreaterThanOrEqual(4.5);
    });

    // 誰の色相になるかは配った先で決まるので (`src/member.ts`)、**円のどこでも**
    // 満たしていなければ保証にならない。固定の 2 人だけ見ても、3 人目からが
    // 見えていないことになる。
    test("誰の色でも、名乗りは 4.5 以上・罫は 3.0 以上", () => {
      const chroma = value("member-c");
      for (let h = 0; h < 360; h += 5) {
        // 誰かの行は自分の色の面の上に立つので、地は中立とその人の面の両方を見る。
        const grounds = [
          ...GROUNDS.map(ground),
          step(dark, 2, chroma, h),
          step(dark, 3, chroma, h),
        ];
        for (const on of grounds) {
          expect(contrast(step(dark, 12, chroma, h), on)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(step(dark, 8, chroma, h), on)).toBeGreaterThanOrEqual(3.0);
        }
      }
    });

    test("識別の族の上に乗る文字は 4.5 以上", () => {
      const seed = faced("tag-seed", dark);
      const h0 = hue("tag-h0");
      const stepH = hue("tag-step");
      const onTag = faced("on-tag", dark);
      for (let n = 0; n < 6; n += 1) {
        expect(contrast(onTag, { ...seed, h: h0 + n * stepH })).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
}

/** face で値が変わるものは、**すべて `light-dark()` の 1 行**で書いてある
 * (DR-0001 §2.4)。第 2 の表を作らないための取り決めなので、ここで見る。 */
describe("face の切り替え", () => {
  test("face を述べる規則は色の値を持たず、色の面だけを言う", () => {
    for (const rule of [':root[data-theme="light"] {', ':root[data-theme="dark"] {']) {
      expect(block(rule)).not.toMatch(/--[a-z0-9-]+:/);
      expect(block(rule)).toMatch(/color-scheme:/);
    }
  });

  test("段の明るさは 12 段とも light と dark を 1 行に持つ", () => {
    for (let n = 1; n <= 12; n += 1) {
      expect(stepL(n, false)).toBeGreaterThan(0);
      expect(stepL(n, true)).toBeGreaterThan(0);
      expect(stepL(n, false)).not.toBe(stepL(n, true));
    }
  });
});
