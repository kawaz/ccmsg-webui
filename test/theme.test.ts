import { describe, expect, test } from "bun:test";
import {
  changed,
  clamp,
  EMPTY,
  formatTheme,
  hex,
  INPUTS,
  parseOklch,
  parseTheme,
  PRESETS,
  SLIDERS,
  type Theme,
} from "../src/theme.ts";

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
    const held = { face: "dark" as const, inputs: { [spec.name]: 200 } };
    expect(parseTheme(formatTheme(held))).toEqual(held);
  });

  test("選んでいない項は入らない", () => {
    expect(parseTheme(formatTheme(EMPTY))).toEqual(EMPTY);
    expect(formatTheme(EMPTY)).toBe("{}");
  });

  test("読めない項だけが落ちる", () => {
    const raw = JSON.stringify({
      face: "sepia",
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

/** 名前付きの組が持ってよいのは層 0 の入力だけ。段表を持たないことがここの
 * 保証で、それが崩れた時に落ちるのはこの test。 */
describe("色の組", () => {
  test("持っているのは入力の名前だけ", () => {
    const known = new Set(INPUTS.map((spec) => spec.name));
    for (const one of PRESETS) {
      for (const name of Object.keys(one.theme.inputs)) expect(known).toContain(name);
    }
  });

  test("値は入力の範囲に収まっている", () => {
    for (const one of PRESETS) {
      for (const spec of INPUTS) {
        const value = one.theme.inputs[spec.name];
        if (value === undefined) continue;
        expect(clamp(spec, value)).toBe(value);
      }
    }
  });

  test("face は持たない (light と dark は同じ入力の別の L 行)", () => {
    for (const one of PRESETS) expect(one.theme.face).toBeUndefined();
  });

  test("覚えた値としてそのまま読み戻る", () => {
    for (const one of PRESETS) expect(parseTheme(formatTheme(one.theme))).toEqual(one.theme);
  });

  test("標準は何も選んでいないこと", () => {
    expect(PRESETS[0]?.theme).toEqual(EMPTY);
  });

  test("名前は重ならない", () => {
    expect(new Set(PRESETS.map((one) => one.id)).size).toBe(PRESETS.length);
  });
});

/** ベースと比べて何が違うか。**選んでいないことも 1 つの値**として比べるので、
 * 「その項を消す」が差として出る。 */
describe("ベースとの差", () => {
  // 主語の色以外から 1 つ。主語の色は 2 入力で 1 つの選択なので、単独の項の
  // 振る舞いを見るこの節では使わない。
  const spec = SLIDERS[0] as (typeof SLIDERS)[number];

  test("同じものは差が無い", () => {
    const held: Theme = { face: "dark", inputs: { [spec.name]: 200, "brand-c": 0.13 } };
    expect([...changed(held, held)]).toEqual([]);
  });

  test("face を選んでいないことと system を選ぶことは同じ", () => {
    expect([...changed({ inputs: {} }, { face: "system", inputs: {} })]).toEqual([]);
    expect([...changed({ face: "dark", inputs: {} }, EMPTY)]).toEqual(["face"]);
  });

  test("項を消したことも差として出る", () => {
    const from: Theme = { inputs: { [spec.name]: 200, "brand-h": 253 } };
    expect([...changed(EMPTY, from)].sort()).toEqual([spec.name, "brand-h"].sort());
  });

  test("違う項だけが並ぶ", () => {
    const from: Theme = { inputs: { [spec.name]: 200, "h-danger": 30 } };
    const draft: Theme = { inputs: { [spec.name]: 200, "h-danger": 40 } };
    expect([...changed(draft, from)]).toEqual(["h-danger"]);
  });
});

/** ここで色を計算しているわけではない — picker が扱えるのは sRGB の 16 進なので、
 * 画面に出ている oklch をそこまで連れて行くだけ。逆向き (picker が選んだ色から
 * 色相と色味を取り出す) はブラウザにやらせるので、ここには無い。 */
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
