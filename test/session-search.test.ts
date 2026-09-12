import { describe, expect, test } from "bun:test";
import {
  DEFAULT_WITHIN,
  EMPTY_FORM,
  highlightWords,
  isBlank,
  searchArgs,
  sizeWords,
  withinMs,
} from "../src/search/session-search.ts";

describe("いつまで遡るか", () => {
  test("単位を書かなければ日", () => {
    expect(withinMs("5")).toBe(5 * 86_400_000);
    expect(withinMs(DEFAULT_WITHIN)).toBe(5 * 86_400_000);
  });

  test("s / m / h / d / w を読む", () => {
    expect(withinMs("90m")).toBe(90 * 60_000);
    expect(withinMs("36h")).toBe(36 * 3_600_000);
    expect(withinMs("2w")).toBe(2 * 604_800_000);
  });

  test("読めない綴りは窓を置かない — 狭い窓を黙って作らない", () => {
    expect(withinMs("")).toBeUndefined();
    expect(withinMs("きのう")).toBeUndefined();
    expect(withinMs("0d")).toBeUndefined();
    expect(withinMs("5 days")).toBeUndefined();
  });
});

describe("契約へ渡す形", () => {
  test("空欄は送らない (空文字は「空文字に一致するもの」になる)", () => {
    expect(searchArgs({ ...EMPTY_FORM, query: "  fold  " })).toEqual({
      query: "fold",
      modified_within_ms: 5 * 86_400_000,
    });
  });

  test("既定のままの対象は言わず、落とした時だけ言う", () => {
    expect(searchArgs({ ...EMPTY_FORM, query: "a", agent: false })).toMatchObject({
      target_agent: false,
    });
    expect(searchArgs({ ...EMPTY_FORM, query: "a" })).not.toHaveProperty("target_user");
  });

  test("正規表現と大小の区別は、立てた時だけ渡す", () => {
    expect(
      searchArgs({ ...EMPTY_FORM, query: "a", regex: true, caseSensitive: true }),
    ).toMatchObject({ regex: true, case_sensitive: true });
  });

  test("窓が読めない時は窓を渡さない (instance は全部を見る)", () => {
    expect(searchArgs({ ...EMPTY_FORM, query: "a", within: "" })).not.toHaveProperty(
      "modified_within_ms",
    );
  });

  test("探す相手が 1 つも無い入力は押させない", () => {
    expect(isBlank(EMPTY_FORM)).toBe(true);
    expect(isBlank({ ...EMPTY_FORM, sid: "1111" })).toBe(false);
    expect(isBlank({ ...EMPTY_FORM, cwd: "webui" })).toBe(false);
  });
});

describe("出す言葉", () => {
  test("大きさは桁が分かる形で", () => {
    expect(sizeWords(512)).toBe("512 B");
    expect(sizeWords(2048)).toBe("2 KiB");
    expect(sizeWords(3 * 1024 * 1024)).toBe("3.0 MiB");
  });

  test("光らせる語は、画面の中を探す側と同じ parser を通る", () => {
    expect(
      highlightWords({ ...EMPTY_FORM, query: "fold window" }).map((word) => word.text),
    ).toEqual(["fold", "window"]);
  });
});
