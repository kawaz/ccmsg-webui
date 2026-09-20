/** 公開されている build が、今開いている build と同じものかを読む所。
 *
 * この画面は静的な site として配られるので、置き場が新しい build に入れ替わって
 * も、開いたままの頁は古い asset を握り続ける。index は毎回聞き直す約束にして
 * あり (`no-cache`)、asset は名前が中身で決まるので永く持たせてよい
 * (`immutable`) — 足りないのは**入れ替わったことを頁が知る所**で、それを言うのが
 * `version.json` (build が出す、その build の名前だけの文書)。
 *
 * ここは読み取りだけで、いつ聞くか・知った後どうするかは持たない。 */

/** `dist/version.json` の中身。 */
export interface BuildDocument {
  readonly version: string;
  readonly built_at: string;
}

/** 公開されている build が違うなら、その理由を言う言葉。同じ時・読めなかった
 * 時は何も言わない。
 *
 * **読めなかったら黙る**のは、「新しい build がある」が確かめられた時にだけ
 * 言える事実だから。置き場が index を返した (dev server の fallback)、経路上の
 * 何かが別の文書を返した、といった場合に印を立てると、人は何度読み込み直しても
 * 消えない印を押し続けることになる。 */
export function newerBuild(running: string, published: unknown): string | undefined {
  if (typeof published !== "object" || published === null) return undefined;
  const said: unknown = (published as { version?: unknown }).version;
  if (typeof said !== "string" || said === "") return undefined;
  if (said === running) return undefined;
  return `新しい build があります (この画面は ${running}、置き場は ${said})`;
}
