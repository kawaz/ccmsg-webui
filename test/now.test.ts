// 相対時刻の時計 (src/now.ts)。
//
// 固定するのは 3 つ: 出る文字、粒度の選び方、そして**誰がいつ描き直されるか**。
// 3 つめが本題で、見えていない行が刻みのたびに描き直されない・粗い粒度の行が
// 細かい刻みで描き直されないことを、signal の購読 (effect が何回走ったか) で
// 数える。DOM は要らない — 見えているかどうかは `nowFor` の引数なので、
// `IntersectionObserver` の側は実機 (visual) の担当。
import { describe, expect, test } from "bun:test";
import { effect } from "@preact/signals";
import {
  grainOf,
  holdNow,
  nowFor,
  nowOf,
  relativeAge,
  runningClocks,
  tickNow,
  TICK_MS,
} from "../src/now.ts";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("どのくらい前か", () => {
  test("秒は 10 秒に丸め、10 分までは分と秒の 2 つで出る", () => {
    expect(relativeAge(0)).toBe("0s");
    expect(relativeAge(19 * SECOND)).toBe("10s");
    expect(relativeAge(3 * MINUTE + 10 * SECOND)).toBe("3m10s");
    expect(relativeAge(3 * MINUTE + 19 * SECOND)).toBe("3m10s");
    expect(relativeAge(9 * MINUTE + 50 * SECOND)).toBe("9m50s");
  });

  test("10 分・1 時間・1 日で出し方が変わる", () => {
    expect(relativeAge(10 * MINUTE)).toBe("10m");
    expect(relativeAge(12 * MINUTE + 59 * SECOND)).toBe("12m");
    expect(relativeAge(59 * MINUTE)).toBe("59m");
    expect(relativeAge(HOUR)).toBe("1h0m");
    expect(relativeAge(HOUR + 40 * MINUTE)).toBe("1h40m");
    expect(relativeAge(23 * HOUR + 59 * MINUTE)).toBe("23h59m");
    expect(relativeAge(DAY)).toBe("1d0h");
    expect(relativeAge(2 * DAY + 5 * HOUR)).toBe("2d5h");
  });

  test("ひと月より古いものは日だけで足りる", () => {
    expect(relativeAge(29 * DAY + 23 * HOUR)).toBe("29d23h");
    expect(relativeAge(30 * DAY)).toBe("30d");
    expect(relativeAge(400 * DAY)).toBe("400d");
  });

  test("先の時刻は 0 として出す (時計のずれで負の古さを出さない)", () => {
    expect(relativeAge(-5 * MINUTE)).toBe("0s");
  });
});

describe("粒度", () => {
  test("出ている最小単位がそのまま読む粒度になる", () => {
    expect(grainOf(0)).toBe("s10");
    expect(grainOf(9 * MINUTE + 59 * SECOND)).toBe("s10");
    expect(grainOf(10 * MINUTE)).toBe("m1");
    expect(grainOf(23 * HOUR)).toBe("m1");
    expect(grainOf(DAY)).toBe("h1");
    expect(grainOf(30 * DAY)).toBe("d1");
  });
});

/** その行が描き直された回数を数える。読むのは `nowFor` だけなので、購読する
 * signal もその行が選んだ粒度のものだけになる。 */
function watchRow(at: number, visible: () => boolean): { draws: number; stop: () => void } {
  const row = { draws: 0, stop: () => {} };
  let last = nowOf("s10").peek();
  row.stop = effect(() => {
    last = nowFor(at, visible(), last);
    row.draws += 1;
  });
  return row;
}

describe("誰が描き直されるか", () => {
  test("見えていない行は刻んでも描き直されない", () => {
    const base = 1_800_000_000_000;
    tickNow(base);
    const seen = watchRow(base - MINUTE, () => true);
    const hidden = watchRow(base - MINUTE, () => false);
    expect(seen.draws).toBe(1);
    expect(hidden.draws).toBe(1);
    tickNow(base + 10 * SECOND);
    expect(seen.draws).toBe(2);
    expect(hidden.draws).toBe(1);
    tickNow(base + 20 * SECOND);
    expect(seen.draws).toBe(3);
    expect(hidden.draws).toBe(1);
    seen.stop();
    hidden.stop();
  });

  test("粗い粒度の行は細かい刻みで描き直されない", () => {
    const base = 1_800_000_000_000;
    tickNow(base);
    const fresh = watchRow(base - MINUTE, () => true);
    const old = watchRow(base - 5 * HOUR, () => true);
    tickNow(base + 10 * SECOND);
    expect(fresh.draws).toBe(2);
    // 5 時間前の行は分の粒度を読むので、10 秒では動かない。
    expect(old.draws).toBe(1);
    tickNow(base + MINUTE);
    expect(old.draws).toBe(2);
    fresh.stop();
    old.stop();
  });

  test("閾値をまたいだ行は、自分の粒度の次の刻みで読む先を粗い方へ移す", () => {
    const base = 1_800_000_000_000;
    tickNow(base);
    const row = watchRow(base - (10 * MINUTE - 10 * SECOND), () => true);
    expect(row.draws).toBe(1);
    // 秒の刻みで 10 分を越える。越えたことが分かるのは次に読んだ時なので、
    // この刻みではまだ秒の粒度を読んでいる。
    tickNow(base + 10 * SECOND);
    expect(row.draws).toBe(2);
    // その次の秒の刻みで読む先が分へ移る。
    tickNow(base + 20 * SECOND);
    expect(row.draws).toBe(3);
    // 移った後は秒だけの刻みでは動かない。
    tickNow(base + 30 * SECOND);
    expect(row.draws).toBe(3);
    tickNow(base + MINUTE);
    expect(row.draws).toBe(4);
    row.stop();
  });
});

describe("時計", () => {
  test("何人が読んでいても動くのは 1 本で、最後の 1 人が離すと止まる", () => {
    expect(runningClocks()).toBe(0);
    const first = holdNow();
    const second = holdNow();
    expect(runningClocks()).toBe(1);
    first();
    expect(runningClocks()).toBe(1);
    second();
    expect(runningClocks()).toBe(0);
  });

  test("離す手は 2 度呼ばれても数を狂わせない", () => {
    const release = holdNow();
    const other = holdNow();
    release();
    release();
    expect(runningClocks()).toBe(1);
    other();
    expect(runningClocks()).toBe(0);
  });

  test("刻みはいちばん細かい粒度と同じ", () => {
    expect(TICK_MS).toBe(10 * SECOND);
  });
});
