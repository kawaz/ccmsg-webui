import { signal, type ReadonlySignal, type Signal } from "@preact/signals";

/** 「どのくらい前か」を出す所が読む時計。
 *
 * 画面に相対時刻が何百と並ぶので、時計は**1 本**にする。各所が自分の
 * `setInterval` を持つと、同じ 1 秒に何度も描き直しが走り、止め忘れも各所の
 * 責任になる。
 *
 * 配るのは生の時刻ではなく、**表示に効く粒度に丸めた時刻**を粒度ごとに 1 つずつ。
 * `1h40m` と出ている行にとって秒は見えないので、秒が変わるたびに値を配ると
 * 見た目の変わらない描き直しになる。丸めた値は粒度が変わる瞬間にしか動かない
 * ので、読む側は「自分に効く粒度」だけを読めば、その粒度でしか描き直されない。 */

/** 表示の最小単位。読む側はこのどれか 1 つだけを読む。 */
export type Grain = "s10" | "m1" | "h1" | "d1";

/** 粒度の刻み。秒は 10 秒刻み — 1 秒刻みは気が散るだけで、「どのくらい前か」
 * には要らない。表示も 10 秒に丸めるので、刻みと見た目が一致する。 */
export const GRAIN_MS: Readonly<Record<Grain, number>> = {
  s10: 10_000,
  m1: 60_000,
  h1: 3_600_000,
  d1: 86_400_000,
};

/** 時計が動く間隔。いちばん細かい粒度と同じで、これより速く刻んでも配る値は
 * 変わらない。 */
export const TICK_MS = GRAIN_MS.s10;

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** 秒を出すのをやめる所。ここから先は分だけになる。 */
const SECONDS_UNTIL = 10 * MINUTE;

/** 日だけになる所。ひと月も前のものに時間まで出しても、読む理由がない。 */
const DAYS_ONLY_FROM = 30 * DAY;

const signals: Readonly<Record<Grain, Signal<number>>> = {
  s10: signal(floor(Date.now(), GRAIN_MS.s10)),
  m1: signal(floor(Date.now(), GRAIN_MS.m1)),
  h1: signal(floor(Date.now(), GRAIN_MS.h1)),
  d1: signal(floor(Date.now(), GRAIN_MS.d1)),
};

function floor(at: number, grain: number): number {
  return Math.floor(at / grain) * grain;
}

/** その粒度に丸めた今。 */
export function nowOf(grain: Grain): ReadonlySignal<number> {
  return signals[grain];
}

/** 時計を進める。値が変わらない粒度は触らない — 触ると、見た目の変わらない
 * 描き直しがその粒度を読んでいる全ての所で走る。 */
export function tickNow(at: number): void {
  for (const grain of Object.keys(signals) as Grain[]) {
    const rounded = floor(at, GRAIN_MS[grain]);
    if (signals[grain].peek() !== rounded) signals[grain].value = rounded;
  }
}

let timer: ReturnType<typeof setInterval> | undefined;
let held = 0;

/** 相対時刻を出す所が居る間だけ時計を動かす。返るのは離す手。
 *
 * 数を数えるのは、時計を止める条件が「最後の 1 つが居なくなった時」だから。
 * 出ている所が 1 つも無い画面 (file だけを見ている等) で時計を回し続けない。 */
export function holdNow(): () => void {
  held += 1;
  if (timer === undefined) {
    tickNow(Date.now());
    timer = setInterval(() => {
      tickNow(Date.now());
    }, TICK_MS);
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    held -= 1;
    if (held === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** 動いている時計の本数。1 本であることを test が確かめるためにある。 */
export function runningClocks(): number {
  return timer === undefined ? 0 : 1;
}

/** その古さを出すのに要る最小単位。 */
export function grainOf(elapsed: number): Grain {
  const age = Math.max(0, elapsed);
  if (age < SECONDS_UNTIL) return "s10";
  if (age < DAY) return "m1";
  if (age < DAYS_ONLY_FROM) return "h1";
  return "d1";
}

/** どのくらい前か。`40s` / `3m10s` / `12m` / `1h40m` / `2d5h` / `35d`。
 *
 * 細かい所ほど 2 単位で出すのは、そこが「今さっきか、少し前か」を読む所だから。
 * 古くなるほど上の単位だけで足りる。 */
export function relativeAge(elapsed: number): string {
  const age = Math.max(0, elapsed);
  if (age < MINUTE) return `${String(floor(age, GRAIN_MS.s10) / 1000)}s`;
  if (age < SECONDS_UNTIL) {
    return `${String(Math.floor(age / MINUTE))}m${String(floor(age % MINUTE, GRAIN_MS.s10) / 1000)}s`;
  }
  if (age < HOUR) return `${String(Math.floor(age / MINUTE))}m`;
  if (age < DAY) {
    return `${String(Math.floor(age / HOUR))}h${String(Math.floor((age % HOUR) / MINUTE))}m`;
  }
  if (age < DAYS_ONLY_FROM) {
    return `${String(Math.floor(age / DAY))}d${String(Math.floor((age % DAY) / HOUR))}h`;
  }
  return `${String(Math.floor(age / DAY))}d`;
}

/** その行が今読む「今」。
 *
 * 見えていないものは**時計を読まない** — 読めばその粒度を購読することになり、
 * 画面の外に居るまま刻むたびに描き直される。代わりに最後に読んだ値をそのまま
 * 返すので、見えていない間は何も起きず、見えた瞬間に読み直す。
 *
 * 粒度は「最後に読んだ今」から決める。閾値をまたいだことは自分の粒度の次の刻み
 * で分かり、そこで読む先が 1 段粗い方へ移る (移った後は粗い刻みでしか動かない)。 */
export function nowFor(at: number, visible: boolean, last: number): number {
  if (!visible) return last;
  return nowOf(grainOf(last - at)).value;
}
