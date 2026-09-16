import { describe, expect, test } from "bun:test";
import { clamp, EMPTY, formatTheme, hex, INPUTS, parseOklch, parseTheme } from "../src/theme.ts";

/** 覚えている値は手で書き換えられるし、古い build が書いたものも残る。読む側の
 * 構えは「読めない項はその項だけ捨てる」で、選んだ色ぜんぶを失わせない。 */
describe("覚えていた theme", () => {
  const spec = INPUTS[0] as (typeof INPUTS)[number];

  test("何も無ければ app.css のままで立つ", () => {
    expect(parseTheme(undefined)).toEqual(EMPTY);
    expect(parseTheme("")).toEqual(EMPTY);
    expect(parseTheme("{")).toEqual(EMPTY);
    expect(parseTheme("[1,2]")).toEqual(EMPTY);
  });

  test("書いた通りに読み戻る", () => {
    const held = { face: "dark" as const, brand: "#2563eb", inputs: { [spec.name]: 200 } };
    expect(parseTheme(formatTheme(held))).toEqual(held);
  });

  test("選んでいない項は入らない", () => {
    expect(parseTheme(formatTheme(EMPTY))).toEqual(EMPTY);
    expect(formatTheme(EMPTY)).toBe("{}");
  });

  test("読めない項だけが落ちる", () => {
    const raw = JSON.stringify({
      face: "sepia",
      brand: "red",
      [spec.name]: 200,
      "h-danger": "30",
      "not-an-input": 1,
    });
    expect(parseTheme(raw)).toEqual({ inputs: { [spec.name]: 200 } });
  });

  test("範囲の外は範囲に収まる", () => {
    const raw = JSON.stringify({ [spec.name]: 9999, "neutral-c": -1 });
    const read = parseTheme(raw);
    expect(read.inputs[spec.name]).toBe(spec.max);
    expect(read.inputs["neutral-c"]).toBe(0);
  });

  test("色相は度、色味は 3 桁まで", () => {
    expect(clamp({ name: "h", kind: "hue", max: 360 }, 12.7)).toBe(13);
    expect(clamp({ name: "c", kind: "chroma", max: 0.03 }, 0.0126)).toBe(0.013);
  });
});

/** ここで色を計算しているわけではない — picker が扱えるのは sRGB の 16 進なので、
 * app.css が書いている oklch をそこまで連れて行くだけ。 */
describe("picker に渡す初期値", () => {
  test("oklch を読む", () => {
    expect(parseOklch("oklch(0.545 0.13 253)")).toEqual({ l: 0.545, c: 0.13, h: 253 });
    expect(parseOklch("oklch(0.545 0.13 253 / 50%)")?.h).toBe(253);
    expect(parseOklch("#2563eb")).toBeUndefined();
    expect(parseOklch("")).toBeUndefined();
  });

  test("16 進は 7 文字で、picker がそのまま受ける形", () => {
    expect(hex({ l: 0, c: 0, h: 0 })).toBe("#000000");
    expect(hex({ l: 1, c: 0, h: 0 })).toBe("#ffffff");
    expect(hex({ l: 0.545, c: 0.13, h: 253 })).toMatch(/^#[0-9a-f]{6}$/);
  });

  test("色域の外へ出た色も綴りは崩れない", () => {
    expect(hex({ l: 0.5, c: 0.9, h: 140 })).toMatch(/^#[0-9a-f]{6}$/);
  });
});
