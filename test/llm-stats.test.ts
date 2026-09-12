import { describe, expect, test } from "bun:test";
import type { LlmStatsDay, LlmStatsReadResult } from "@ccmsg/protocol";
import {
  bucketKey,
  buckets,
  credentialLabel,
  dayUsd,
  modelsOf,
  periodDays,
  tokenTotals,
  tokenWords,
  usdWords,
} from "../src/llm/stats-view.ts";

function day(
  models: Record<string, { usd?: number; requests?: number }>,
  total?: number,
): LlmStatsDay {
  return {
    credentials: { "claude-one": models },
    ...(total === undefined ? {} : { total_usd: total }),
  };
}

function result(days: Record<string, LlmStatsDay>): LlmStatsReadResult {
  return { days };
}

describe("読む単位に畳む", () => {
  test("週は ISO の週番号 — 開いた日で範囲が動かない", () => {
    // 2026-09-12 は土曜、同じ週の月曜は 2026-09-07。
    expect(bucketKey("2026-09-12", "weekly")).toBe(bucketKey("2026-09-07", "weekly"));
    expect(bucketKey("2026-09-12", "weekly")).toMatch(/^2026-W\d\d$/);
    // 日曜は同じ週、翌月曜は次の週 (ISO は月曜始まり)。
    expect(bucketKey("2026-09-13", "weekly")).toBe(bucketKey("2026-09-07", "weekly"));
    expect(bucketKey("2026-09-14", "weekly")).not.toBe(bucketKey("2026-09-13", "weekly"));
  });

  test("月は年月、日はその日のまま", () => {
    expect(bucketKey("2026-09-12", "monthly")).toBe("2026-09");
    expect(bucketKey("2026-09-12", "daily")).toBe("2026-09-12");
  });

  test("読めない日付は束にしない", () => {
    expect(bucketKey("きのう", "daily")).toBeUndefined();
  });

  test("聞く日数は、描く幅より広い (いちばん古い束を途中で切らない)", () => {
    expect(periodDays("daily")).toBeGreaterThan(28);
    expect(periodDays("monthly")).toBeGreaterThan(365);
  });
});

describe("合計", () => {
  test("gateway 自身の合計が勝つ — 内訳に割れない分まで数えている", () => {
    expect(dayUsd(day({ "claude-opus-5": { usd: 1 } }, 3))).toBe(3);
  });

  test("言っていない日だけ、内訳を足して埋める", () => {
    expect(dayUsd(day({ a: { usd: 1 }, b: { usd: 0.5 } }))).toBe(1.5);
  });

  test("束は新しい方から、model は多い方から", () => {
    const rows = buckets(
      result({
        "2026-09-10": day({ "claude-opus-5": { usd: 1 }, "claude-sonnet-5": { usd: 2 } }, 3),
        "2026-09-12": day({ "claude-opus-5": { usd: 5 } }, 5),
      }),
      "daily",
    );
    expect(rows.map((row) => row.key)).toEqual(["2026-09-12", "2026-09-10"]);
    expect(rows[1]?.models.map((one) => one.model)).toEqual(["claude-sonnet-5", "claude-opus-5"]);
  });

  test("月別では同じ月の日が 1 つの束になる", () => {
    const rows = buckets(
      result({
        "2026-09-10": day({ a: { usd: 1 } }, 1),
        "2026-09-12": day({ a: { usd: 2 } }, 2),
        "2026-08-31": day({ a: { usd: 4 } }, 4),
      }),
      "monthly",
    );
    expect(rows.map((row) => [row.key, row.usd])).toEqual([
      ["2026-09", 3],
      ["2026-08", 4],
    ]);
  });

  test("凡例の並びは、画面に出ている合計の多い順", () => {
    const rows = buckets(
      result({ "2026-09-12": day({ small: { usd: 1 }, big: { usd: 9 } }, 10) }),
      "daily",
    );
    expect(modelsOf(rows)).toEqual(["big", "small"]);
  });
});

describe("数え上げと綴り", () => {
  test("token は桁が読めれば足りる", () => {
    expect(tokenWords(900)).toBe("900");
    expect(tokenWords(12_300)).toBe("12.3k");
    expect(tokenWords(4_500_000)).toBe("4.5M");
  });

  test("少額は丸めて 0 と言わない", () => {
    expect(usdWords(0)).toBe("$0");
    expect(usdWords(0.004)).toBe("<$0.01");
    expect(usdWords(12.345)).toBe("$12.35");
  });

  test("token は種類ごとに足す", () => {
    const totals = tokenTotals(
      result({
        "2026-09-12": {
          credentials: {
            one: {
              m: { input_tokens: 10, output_tokens: 2, cache_read_input_tokens: 100, requests: 1 },
            },
          },
        },
      }),
    );
    expect(totals).toEqual({ input: 10, output: 2, cacheWrite: 0, cacheRead: 100, requests: 1 });
  });

  test("どの credential のものか分からない分は、落とさず分類として出す", () => {
    expect(credentialLabel("unknown")).toBe("(不明)");
    expect(credentialLabel("claude-one")).toBe("claude-one");
  });
});
