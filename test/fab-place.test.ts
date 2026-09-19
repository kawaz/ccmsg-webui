import { describe, expect, test } from "bun:test";
import { fabSection, MAX_HEIGHT, MIN_HEIGHT } from "../src/fab-place.ts";

/** 話しかける口の居場所と高さ (DR-0003 §2.7、DR-0002 の section 1 つ)。
 *
 * 覚えてある値は人が手で置いたものなので、**次に開いた時に読めなければ既定に
 * 戻る**しかない。読めない項をその項だけ捨てるのは他の section と同じ規律で、
 * ここで確かめるのはその規律と、高さが意味のある範囲に収まること。 */
describe("覚えてある居場所の読み方", () => {
  test("覚えていない項は既定のまま (何も持たないことが既定そのもの)", () => {
    expect(fabSection.parse(undefined)).toEqual({});
    expect(fabSection.parse("右下")).toEqual({});
    expect(fabSection.parse([12, 34])).toEqual({});
  });

  test("読めない項だけを捨てる", () => {
    expect(fabSection.parse({ right: 40, bottom: "下", height: Number.NaN })).toEqual({
      right: 40,
    });
  });

  test("高さは引ける範囲に収める", () => {
    expect(fabSection.parse({ height: 10 })).toEqual({ height: MIN_HEIGHT });
    expect(fabSection.parse({ height: 9000 })).toEqual({ height: MAX_HEIGHT });
  });
});

describe("差と戻し", () => {
  test("既定と同じ数を持っていることは差ではない", () => {
    expect([...fabSection.changed({ right: 20, bottom: 28, height: 96 }, {})]).toEqual([]);
  });

  test("動かした項だけが差になる", () => {
    expect([...fabSection.changed({ right: 200 }, {})]).toEqual(["right"]);
  });

  test("戻すことは、ベースが持っていない項を消すこと", () => {
    expect(fabSection.revert({ right: 200, height: 200 }, {}, ["right"])).toEqual({ height: 200 });
  });
});
