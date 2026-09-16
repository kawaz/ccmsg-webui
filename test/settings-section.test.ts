import { describe, expect, test } from "bun:test";
import { holdSection, type Section } from "../src/settings-section.ts";

/** section を問わない仕組みの方。色ではなく、**どの section でも同じはずの
 * こと**だけを見る — 触っても覚えないこと、決めた所で覚えること、比べる先が
 * 組と覚えてある値の間で動くこと。
 *
 * 見本の section は数を 2 つ持つだけのもの。色を使うと、落ちた時に「仕組みが
 * 壊れた」のか「色の言い分が変わった」のかが分からなくなる。 */

type Pair = Readonly<Record<string, number>>;

function madeUp(): { section: Section<Pair>; applied: Pair[] } {
  const applied: Pair[] = [];
  const section: Section<Pair> = {
    id: "made-up",
    title: "見本",
    empty: {},
    presets: [
      { id: "none", label: "無し", note: "何も選んでいない状態", value: {} },
      { id: "wide", label: "広い", note: "両方を大きく", value: { a: 10, b: 20 } },
    ],
    parse: (held) => (typeof held === "object" && held !== null ? (held as Pair) : {}),
    format: (value) => value,
    apply: (value) => {
      applied.push(value);
    },
    changed(draft, from) {
      const names = new Set<string>();
      for (const name of ["a", "b"]) if (draft[name] !== from[name]) names.add(name);
      return names;
    },
    revert(draft, from, names) {
      const next = { ...draft };
      for (const name of names) {
        const held = from[name];
        if (held === undefined) delete next[name];
        else next[name] = held;
      }
      return next;
    },
    adopt: (_draft, chosen) => chosen,
    wordFor: (name) => name,
  };
  return { section, applied };
}

describe("section を問わない仕組み", () => {
  test("触っても覚えない。画面には出る", () => {
    const { section, applied } = madeUp();
    const store = holdSection(section);
    store.edit({ a: 1 });
    expect(store.draft.value).toEqual({ a: 1 });
    expect(store.saved.value).toEqual({});
    expect(applied).toContainEqual({ a: 1 });
    expect(store.unsaved.value).toBe(true);
  });

  test("離れれば試したものは消える", () => {
    const { section } = madeUp();
    const store = holdSection(section);
    store.edit({ a: 1 });
    store.discard();
    expect(store.draft.value).toEqual({});
    expect(store.unsaved.value).toBe(false);
  });

  test("決めた所で覚え、そこが次のベースになる", () => {
    const { section } = madeUp();
    const store = holdSection(section);
    store.edit({ a: 1 });
    store.save();
    expect(store.saved.value).toEqual({ a: 1 });
    expect(store.unsaved.value).toBe(false);
    expect([...store.diff.value]).toEqual([]);
  });

  test("組を選んだ直後は差が無く、動かすとその組との差が出る", () => {
    const { section } = madeUp();
    const store = holdSection(section);
    store.choose("wide");
    expect([...store.diff.value]).toEqual([]);
    store.edit({ a: 10, b: 99 });
    expect([...store.diff.value]).toEqual(["b"]);
    // 覚えてある値 (空) との差は別の話。「保存」はそちらで決まる。
    expect(store.unsaved.value).toBe(true);
  });

  test("項ごとに組へ戻せる", () => {
    const { section } = madeUp();
    const store = holdSection(section);
    store.choose("wide");
    store.edit({ a: 10, b: 99 });
    store.revert(["b"]);
    expect(store.draft.value).toEqual({ a: 10, b: 20 });
    expect([...store.diff.value]).toEqual([]);
  });

  test("ベースが持っていない項は、戻すと消える", () => {
    const { section } = madeUp();
    const store = holdSection(section);
    store.edit({ a: 1 });
    store.revert(["a"]);
    expect(store.draft.value).toEqual({});
  });

  test("保存すると組を選んでいたことは役目を終える", () => {
    const { section } = madeUp();
    const store = holdSection(section);
    store.choose("wide");
    expect(store.preset.value).toBe("wide");
    store.save();
    expect(store.preset.value).toBeUndefined();
    expect(store.saved.value).toEqual({ a: 10, b: 20 });
  });

  test("知らない組は何も起こさない", () => {
    const { section } = madeUp();
    const store = holdSection(section);
    store.choose("not-a-preset");
    expect(store.preset.value).toBeUndefined();
    expect(store.draft.value).toEqual({});
  });
});
