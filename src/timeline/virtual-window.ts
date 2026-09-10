/** 持っている窓のうち、目に見える所だけを描くための算術。
 *
 * DOM も preact も知らない純粋な層。ここが答えるのは「今の scrollTop で描くのは
 * どの範囲か」「上と下にどれだけの空白を積めばスクロールバーが窓全体の長さを
 * 表すか」「見ている行を動かさないための scrollTop はどこか」の 3 つだけで、
 * 測るのも動かすのも描く側の仕事。
 *
 * 高さは**測った値を覚え、測っていないものは見積もりで置く**。見積もりは測った
 * 分の平均で、行の高さが桁で違う (1 行の道具呼び出しと、畳まれていない長い
 * コードブロック) 以上、固定値より平均の方が空白の長さを外さない。 */

/** 今この瞬間に描く範囲と、その上下に積む空白。 */
export interface Visible {
  readonly first: number;
  /** 描く最後の次。`first === last` は何も描かないということ。 */
  readonly last: number;
  readonly before: number;
  readonly after: number;
}

/** 行の名前と、その行がどこに居るか。窓が前に伸びても同じ行を指し続けるように、
 * 名前 (= 行の byte 位置) で覚えて index では覚えない。 */
export interface Anchor {
  readonly key: string;
  /** その行の上端から scrollTop までの距離。 */
  readonly gap: number;
}

export function totalHeight(heights: readonly number[]): number {
  let sum = 0;
  for (const height of heights) sum += height;
  return sum;
}

/** index 番目の上端が、並びの先頭から何 px の所か。 */
export function offsetOf(heights: readonly number[], index: number): number {
  let sum = 0;
  for (let at = 0; at < index && at < heights.length; at += 1) sum += heights[at]!;
  return sum;
}

/** `scrollTop` は**並びの先頭を 0 とした位置**。scroller の中で並びの上に別の
 * ものが載っていることは、呼ぶ側がその分を引いてから渡す。
 *
 * `overscan` の分だけ広めに描く: 見えている分ぴったりだと、指が動いた瞬間に
 * まだ何も無い所が見える。 */
export function visibleRange(
  heights: readonly number[],
  scrollTop: number,
  viewportHeight: number,
  overscan: number,
): Visible {
  const count = heights.length;
  if (count === 0) return { first: 0, last: 0, before: 0, after: 0 };
  const top = Math.max(0, scrollTop - overscan);
  const bottom = scrollTop + viewportHeight + overscan;

  let before = 0;
  let first = 0;
  while (first < count && before + heights[first]! <= top) {
    before += heights[first]!;
    first += 1;
  }
  // 窓の外まで滑り落ちた (窓が縮んだ直後など) なら、最後の 1 つを描く。
  if (first >= count) first = count - 1;
  before = offsetOf(heights, first);

  let last = first;
  let filled = before;
  while (last < count && filled < bottom) {
    filled += heights[last]!;
    last += 1;
  }
  // 高さがまだ 1 つも測れていない (viewport が 0 の最初の描画) 場合でも 1 つは
  // 描く。何も描かなければ何も測れず、次が永遠に来ない。
  if (last === first) last = first + 1;

  let after = 0;
  for (let at = last; at < count; at += 1) after += heights[at]!;
  return { first, last, before, after };
}

export function sameRange(a: Visible, b: Visible): boolean {
  return a.first === b.first && a.last === b.last && a.before === b.before && a.after === b.after;
}

/** 今どの行を見ているか。描いている先頭の行と、その上端からのずれで覚える。 */
export function anchorAt(
  keys: readonly string[],
  heights: readonly number[],
  scrollTop: number,
  index: number,
): Anchor | undefined {
  const key = keys[index];
  if (key === undefined) return undefined;
  return { key, gap: scrollTop - offsetOf(heights, index) };
}

/** その行を同じ位置に置き直す、窓の先頭から数えた位置。行ごと窓から落ちていれば
 * 無し。
 *
 * 窓の手前に居る (= 先頭の行より上を見ている) 錨では負になる。ここで 0 に
 * 丸めないのは、窓の上には端の 1 行が載っていて、丸めるとその分だけ読み手が
 * 押し下げられるから。端がどこかを知っているのは DOM を持っている側。 */
export function scrollTopAt(
  keys: readonly string[],
  heights: readonly number[],
  anchor: Anchor,
): number | undefined {
  const index = keys.indexOf(anchor.key);
  if (index < 0) return undefined;
  return offsetOf(heights, index) + anchor.gap;
}

/** 錨の行ごと形が変わった時の逃げ道: 窓が伸びた分だけずらす。
 *
 * 窓の先頭のかたまりは、前の頁が付くとその頁と 1 つに繋がり直すことがある
 * (かたまりは道具の呼び出しの連なりなので、前に足された連なりと地続きになる)。
 * その時、覚えていた名前はもう誰も指していない。答えられるのは「前に足された
 * のだから、読んでいる所はその分だけ下がった」ということだけで、これは前に
 * 足す以外で窓が伸びない限り正しい。 */
export function scrollTopByGrowth(scrollTop: number, was: number, now: number): number {
  return Math.max(0, scrollTop + (now - was));
}

/** その行を画面の真ん中に置く錨。
 *
 * 位置ではなく錨を返すのは、描かれていない行へ動かした先で初めてその行が測ら
 * れるから。間に居る行の高さが見積もりから実測に変われば行は動くので、「真ん中
 * に出す」を 1 度きりの scrollTop で言うと、測った瞬間に外れる。 */
export function anchorCentering(
  keys: readonly string[],
  heights: readonly number[],
  key: string,
  viewportHeight: number,
): Anchor | undefined {
  const index = keys.indexOf(key);
  if (index < 0) return undefined;
  // 画面より高い行は上端に揃える (真ん中に置くと頭が切れる)。
  return { key, gap: Math.min(0, ((heights[index] ?? 0) - viewportHeight) / 2) };
}

/** 末尾に張り付いているか。指が端ちょうどに乗ることは無いので、数 px の幅を
 * 持たせる。 */
export function isAtBottom(
  metrics: { scrollHeight: number; scrollTop: number; clientHeight: number },
  edge: number,
): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= edge;
}

/** 測った高さの覚え書き。
 *
 * 測っていない行には、それまでに測った分の平均を返す。平均は測るたびに動くので、
 * 遡って窓が伸びるほど空白の見積もりが実物に寄っていく。
 *
 * 見積もりが答えるのは 1 行の高さではなく**残り全部の合計**なので、外れ値に
 * 強い中央値ではなく平均を使う。長い行が少数混じる分布で中央値を使うと、合計は
 * いつも実物より短くなり、スクロールバーが窓の長さを言わなくなる。 */
export class HeightBook {
  readonly #seed: number;
  readonly #known = new Map<string, number>();
  #sum = 0;

  constructor(seed: number) {
    this.#seed = seed;
  }

  get estimate(): number {
    return this.#known.size === 0 ? this.#seed : this.#sum / this.#known.size;
  }

  heights(keys: readonly string[]): number[] {
    const estimate = this.estimate;
    return keys.map((key) => this.#known.get(key) ?? estimate);
  }

  /** 覚え直したかどうか。半 px 以下の違いは同じ高さとして扱う — 拡大率や
   * 端数で最後の桁だけが揺れる度に描き直すと、測る→描く→測るが止まらない。 */
  measured(key: string, px: number): boolean {
    const held = this.#known.get(key);
    if (held !== undefined && Math.abs(held - px) < 0.5) return false;
    this.#sum += px - (held ?? 0);
    this.#known.set(key, px);
    return true;
  }

  /** 窓が手放した行のことは忘れる。遡って戻ってきた行は、その時にまた測る。
   *
   * 覚えている数が今の行数より少なくても走る: 追記で行が増えながら先頭が
   * 落ちていく間、覚えている数はずっと行数を下回るので、数で早じまいすると
   * 落ちた行の高さが平均に混ざったまま残り続ける。 */
  keep(keys: readonly string[]): void {
    const live = new Set(keys);
    for (const [key, px] of this.#known) {
      if (live.has(key)) continue;
      this.#known.delete(key);
      this.#sum -= px;
    }
  }
}
