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
    expect(fabSection.parse({ sideX: "right", sideY: "下", x: 40, y: Number.NaN })).toEqual({
      sideX: "right",
      x: 40,
    });
  });

  test("高さは引ける範囲に収める", () => {
    expect(fabSection.parse({ height: 10 })).toEqual({ height: MIN_HEIGHT });
    expect(fabSection.parse({ height: 9000 })).toEqual({ height: MAX_HEIGHT });
  });
});

describe("差と戻し", () => {
  test("既定と同じ辺・同じ距離を持っていることは差ではない", () => {
    expect([...fabSection.changed({ sideX: "right", sideY: "bottom", x: 20, y: 20 }, {})]).toEqual(
      [],
    );
  });

  test("辺が違えば距離が同じでも差になる", () => {
    expect([...fabSection.changed({ sideX: "left", x: 20 }, {})]).toEqual(["x"]);
  });

  test("戻すことは、ベースが持っていない項を消すこと", () => {
    expect(fabSection.revert({ sideX: "left", x: 200, height: 200 }, {}, ["x"])).toEqual({
      height: 200,
    });
  });
});
