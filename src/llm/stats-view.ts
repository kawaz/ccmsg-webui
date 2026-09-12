import type { LlmStatsDay, LlmStatsReadResult } from "@ccmsg/protocol";

/** 費用の画面の算術。日ごとの記録を、読む単位 (日 / 週 / 月) に畳み直す。 */

/** gateway が「どの credential のものか分からなかった」分に付ける名前。本物の
 * 支払いが入っているので落とさず、名前が分類に見える形で出す。 */
const UNATTRIBUTED = "(不明)";

export function credentialLabel(name: string): string {
  return name === "" || name === "unknown" ? UNATTRIBUTED : name;
}

export const PERIODS = ["daily", "weekly", "monthly"] as const;
export type Period = (typeof PERIODS)[number];

export const PERIOD_LABELS: Readonly<Record<Period, string>> = {
  daily: "日別",
  weekly: "週別",
  monthly: "月別",
};

/** その単位を埋めるのに要る日数。**描く幅より少し広く**聞くのは、いちばん古い
 * 束を途中で切らないため (月別で 13 か月ぶん聞けば、画面の左端の月は丸ごと)。 */
const PERIOD_DAYS: Readonly<Record<Period, number>> = {
  daily: 32,
  weekly: 96,
  monthly: 397,
};

export function periodDays(period: Period): number {
  return PERIOD_DAYS[period];
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** gateway の日付を、読む単位の鍵に畳む。
 *
 * 週は ISO-8601 の週番号 (`2026-W31`)。「今日から 7 日前まで」にすると、同じ
 * 週が画面を開く日によって別の範囲を指すことになり、先週と今週を比べられない。 */
export function bucketKey(date: string, period: Period): string | undefined {
  const said = DATE.exec(date);
  if (said === null) return undefined;
  const [, year, month, day] = said as unknown as [string, string, string, string];
  if (period === "daily") return date;
  if (period === "monthly") return `${year}-${month}`;
  const at = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  // ISO の週: 木曜日が属する年と、その年の第 1 木曜からの週数。
  const weekday = (at.getUTCDay() + 6) % 7;
  at.setUTCDate(at.getUTCDate() - weekday + 3);
  const firstThursday = new Date(Date.UTC(at.getUTCFullYear(), 0, 4));
  const firstWeekday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstWeekday + 3);
  const week = 1 + Math.round((at.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${String(at.getUTCFullYear())}-W${String(week).padStart(2, "0")}`;
}

export interface ModelSpend {
  readonly model: string;
  readonly usd: number;
}

export interface Bucket {
  readonly key: string;
  /** その束の合計。gateway が日ごとに言った合計を足したもの。 */
  readonly usd: number;
  /** model ごと、多い順。 */
  readonly models: readonly ModelSpend[];
}

/** 1 日の合計。**gateway 自身の数字が勝つ** — model ごとに割れない分まで数えた
 * 正本で、内訳の合計を上回ることが正当にありうる。言っていない日だけ、内訳を
 * 足して埋める。 */
export function dayUsd(day: LlmStatsDay): number {
  if (day.total_usd !== undefined) return day.total_usd;
  let sum = 0;
  for (const models of Object.values(day.credentials)) {
    for (const usage of Object.values(models)) sum += usage.usd ?? 0;
  }
  return sum;
}

function modelUsd(day: LlmStatsDay): Map<string, number> {
  const out = new Map<string, number>();
  for (const models of Object.values(day.credentials)) {
    for (const [model, usage] of Object.entries(models)) {
      out.set(model, (out.get(model) ?? 0) + (usage.usd ?? 0));
    }
  }
  return out;
}

/** 新しい束から。画面を開く理由は直近にあり、古い方は下へ流れていく。 */
export function buckets(result: LlmStatsReadResult, period: Period): readonly Bucket[] {
  const totals = new Map<string, { usd: number; models: Map<string, number> }>();
  for (const [date, day] of Object.entries(result.days)) {
    const key = bucketKey(date, period);
    if (key === undefined) continue;
    const held = totals.get(key) ?? { usd: 0, models: new Map<string, number>() };
    held.usd += dayUsd(day);
    for (const [model, usd] of modelUsd(day)) {
      held.models.set(model, (held.models.get(model) ?? 0) + usd);
    }
    totals.set(key, held);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, held]) => ({
      key,
      usd: held.usd,
      // 多い方から。画面は「何に使ったか」を読みに来るので、答えが先頭に来る。
      // 同額なら名前で並べる — 0 が並んだ時に、読むたびに順が入れ替わらない。
      models: [...held.models.entries()]
        .map(([model, usd]) => ({ model, usd }))
        .sort((a, b) => (b.usd === a.usd ? a.model.localeCompare(b.model) : b.usd - a.usd)),
    }));
}

/** 画面に出ている束ぜんぶで使った model。棒の色と凡例が同じ順を使うための正本。 */
export function modelsOf(rows: readonly Bucket[]): readonly string[] {
  const seen = new Map<string, number>();
  for (const row of rows) {
    for (const model of row.models) seen.set(model.model, (seen.get(model.model) ?? 0) + model.usd);
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([model]) => model);
}

export function usdWords(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(usd < 100 ? 2 : 0)}`;
}

/** token の桁。数え上げではなく桁が読めれば足りるので、千・百万で丸める。 */
export function tokenWords(tokens: number): string {
  if (tokens < 1000) return String(tokens);
  if (tokens < 1_000_000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${(tokens / 1_000_000).toFixed(1)}M`;
}

/** その期間に読み書きした token の合計 (cache 分も含む、種類ごと)。 */
export interface TokenTotals {
  readonly input: number;
  readonly output: number;
  readonly cacheWrite: number;
  readonly cacheRead: number;
  readonly requests: number;
}

export function tokenTotals(result: LlmStatsReadResult): TokenTotals {
  let input = 0;
  let output = 0;
  let cacheWrite = 0;
  let cacheRead = 0;
  let requests = 0;
  for (const day of Object.values(result.days)) {
    for (const models of Object.values(day.credentials)) {
      for (const usage of Object.values(models)) {
        input += usage.input_tokens ?? 0;
        output += usage.output_tokens ?? 0;
        cacheWrite += usage.cache_creation_input_tokens ?? 0;
        cacheRead += usage.cache_read_input_tokens ?? 0;
        requests += usage.requests ?? 0;
      }
    }
  }
  return { input, output, cacheWrite, cacheRead, requests };
}
