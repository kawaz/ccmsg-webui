import { describe, expect, test } from "bun:test";
import { newerBuild } from "../src/build-version.ts";

/** 置き場に出ている build と、今開いている build を比べる所
 * (`src/build-version.ts`)。
 *
 * いつ聞くか (繋がった時・前面に戻った時) は出来事の側にあるので、ここで固定
 * するのは**聞いた答えの読み方**だけ。印が立つ / 立たないは全部ここで決まる。 */
describe("置き場の build を読む", () => {
  test("違う名前なら、両方を言う理由が返る", () => {
    expect(newerBuild("1.13.1", { version: "1.13.2", built_at: "2026-09-20T00:00:00Z" })).toBe(
      "新しい build があります (この画面は 1.13.1、置き場は 1.13.2)",
    );
  });

  test("同じ名前なら何も言わない", () => {
    expect(newerBuild("1.13.1", { version: "1.13.1", built_at: "x" })).toBeUndefined();
  });

  // 置き場に届かなかった・別の文書が返った時に印を立てると、読み込み直しても
  // 消えない印を人が押し続けることになる。
  test("build の名前が読めない答えでは何も言わない", () => {
    expect(newerBuild("1.13.1", undefined)).toBeUndefined();
    expect(newerBuild("1.13.1", null)).toBeUndefined();
    expect(newerBuild("1.13.1", "<!doctype html>")).toBeUndefined();
    expect(newerBuild("1.13.1", {})).toBeUndefined();
    expect(newerBuild("1.13.1", { version: "" })).toBeUndefined();
    expect(newerBuild("1.13.1", { version: 2 })).toBeUndefined();
  });
});
