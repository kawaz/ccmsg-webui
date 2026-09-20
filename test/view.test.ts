import { describe, expect, test } from "bun:test";
import { mediaTypeFor, viewableKindFor } from "../src/files/media-type.ts";
import { allows, type ViewGrant } from "../src/files/view-port.ts";
import { parseRange, parseViewPath } from "../view/protocol.ts";
import type { BytesAsk } from "../view/protocol.ts";
import type { Sid } from "@ccmsg/protocol";

/** 閲覧の道の、形だけで決まる所 (DR-0005)。
 *
 * ここで固定するのは**誰も繋がっていなくても答えが出る**もの — URL の読み解き、
 * 範囲の読み解き、型の決め方、そして門番。実際にバイト列が流れるかは
 * `test/visual/view.visual.ts` が端から端まで通して確かめる。 */

const SID = "11111111-2222-4333-8444-555555555555" as Sid;

function ask(fields: Partial<BytesAsk>): BytesAsk {
  return { id: 1, ask: "bytes", sid: SID, kind: "contained", path: "docs/fig.png", ...fields };
}

describe("閲覧の URL", () => {
  test("sid と kind とパスに分かれる", () => {
    expect(parseViewPath("/view/abc/contained/docs/fig.png")).toEqual({
      sid: "abc",
      kind: "contained",
      path: "docs/fig.png",
    });
  });

  test("絶対パスは先頭の / ごと戻る (workspace の綴り)", () => {
    expect(parseViewPath("/view/abc/workspace//srv/app/fig.png")?.path).toBe("/srv/app/fig.png");
  });

  test("percent で綴られた名前は元に戻る", () => {
    expect(parseViewPath("/view/abc/contained/docs/%E5%9B%B3.png")?.path).toBe("docs/図.png");
  });

  test("閲覧の下でない道と、足りない道は読めない", () => {
    expect(parseViewPath("/sw.js")).toBeUndefined();
    expect(parseViewPath("/view/abc")).toBeUndefined();
  });
});

describe("ブラウザが聞いた範囲", () => {
  test("始点だけなら終端まで", () => {
    expect(parseRange("bytes=100-")).toEqual({ offset: 100 });
  });

  test("始点と終点は、含む数で長さになる", () => {
    expect(parseRange("bytes=0-9")).toEqual({ offset: 0, length: 10 });
  });

  test("末尾から数えた長さはそのまま持つ (始点は大きさを知らないと決まらない)", () => {
    expect(parseRange("bytes=-500")).toEqual({ suffix: 500 });
  });

  test("答えられない綴りは、範囲を見なかったことにする", () => {
    expect(parseRange(null)).toBeUndefined();
    expect(parseRange("bytes=0-9,20-29")).toBeUndefined();
    expect(parseRange("bytes=9-0")).toBeUndefined();
    expect(parseRange("items=0-9")).toBeUndefined();
  });
});

describe("何として渡すか", () => {
  test("ブラウザが素で描ける物には型が付く", () => {
    expect(mediaTypeFor("docs/fig.PNG")).toBe("image/png");
    expect(viewableKindFor("docs/page.html")).toBe("html");
    expect(viewableKindFor("docs/clip.mp4")).toBe("video");
  });

  test("描いた HTML が連れてくる物は、渡せるが単独の閲覧ではない", () => {
    expect(mediaTypeFor("docs/style.css")).toBe("text/css; charset=utf-8");
    expect(viewableKindFor("docs/style.css")).toBeUndefined();
  });

  test("知らない拡張子は誰にも渡さない", () => {
    expect(mediaTypeFor("src/topic-fold.ts")).toBeUndefined();
    expect(mediaTypeFor("LICENSE")).toBeUndefined();
    expect(viewableKindFor("data.bin")).toBeUndefined();
  });
});

describe("門番 (§2.6)", () => {
  const grant: ViewGrant = { sid: SID, kind: "contained", path: "docs/page.html" };

  test("開いたファイルは通る", () => {
    expect(allows(grant, ask({ path: "docs/page.html" }))).toBe(true);
  });

  test("同じ folder の隣も通る (相対参照のため、§2.4)", () => {
    expect(allows(grant, ask({ path: "docs/fig.png" }))).toBe(true);
    expect(allows(grant, ask({ path: "docs/img/fig.png" }))).toBe(true);
  });

  test("folder の外へは出られない", () => {
    expect(allows(grant, ask({ path: "docs/../NOTES.md" }))).toBe(false);
    expect(allows(grant, ask({ path: "/etc/passwd" }))).toBe(false);
  });

  test("別のセッション・別の surface は通らない", () => {
    expect(allows(grant, ask({ sid: "99999999-2222-4333-8444-555555555555" }))).toBe(false);
    expect(allows(grant, ask({ kind: "workspace" }))).toBe(false);
  });

  test("何も開いていなければ何も通らない", () => {
    expect(allows(undefined, ask({}))).toBe(false);
  });

  test("external は開いた 1 ファイルに閉じる (降りる folder が無い)", () => {
    const one: ViewGrant = { sid: SID, kind: "external", path: "/tmp/shot.png" };
    expect(allows(one, ask({ kind: "external", path: "/tmp/shot.png" }))).toBe(true);
    expect(allows(one, ask({ kind: "external", path: "/tmp/other.png" }))).toBe(false);
  });

  test("root 直下を開いた時も、木の外へは出られない", () => {
    const top: ViewGrant = { sid: SID, kind: "contained", path: "NOTES.md" };
    expect(allows(top, ask({ path: "docs/fig.png" }))).toBe(true);
    expect(allows(top, ask({ path: "../outside.png" }))).toBe(false);
  });
});
