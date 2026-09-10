/** 2 ペインの境目がどこにあるか、とその覚え方。
 *
 * ブラウザの store はサイトに 1 つで、1 人が複数の instance に届く。だから
 * 幅も instance を名前に含める (DESIGN「localStorage のキー規律」)。読む側は
 * 手で書き換えられた値も古い build が書いた値も「無い」と同じに扱う — 幅は
 * 見え方の話でしかないので、読めない値で画面を止める理由がない。 */

/** 木の側が取れる幅の範囲。狭い方は行が読める下限、広い方は本文が主役で
 * あり続ける上限。 */
export const SPLIT_MIN_PX = 140;
export const SPLIT_MAX_PX = 640;

export function splitStorageKey(instance: string): string {
  return `ccmsg.layout.split:${instance}`;
}

/** 範囲に収める。掴んだ指が画面の端まで行っても、片方のペインが消えない。 */
export function clampSplitWidth(px: number): number {
  return Math.round(Math.min(SPLIT_MAX_PX, Math.max(SPLIT_MIN_PX, px)));
}

/** 覚えていた幅。無い・数でない・範囲外は「覚えていない」と同じで、
 * `undefined` を返す (呼ぶ側は CSS の既定幅のままになる)。 */
export function parseSplitWidth(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value)) return undefined;
  if (value < SPLIT_MIN_PX || value > SPLIT_MAX_PX) return undefined;
  return Math.round(value);
}

export function formatSplitWidth(px: number): string {
  return String(clampSplitWidth(px));
}
