/** 名前で覚えるカーソルを 1 つ動かす手 (DR-0003 §2.2)。
 *
 * 一覧が何を並べているかは区画ごとに違う (セクションとセッション、フォルダと
 * ファイル) が、**上下がどう動くかは同じ**。端では動かない (回り込まない) —
 * 一覧の端で反対側へ飛ぶと、押しっぱなしで辿っている人が自分がどこに居るか
 * 見失う。
 *
 * カーソルがどこにも居ない (= まだ何も触っていない、または居た行が消えた) 時は、
 * 動かす向きの端から始める。 */
export function stepKey(
  keys: readonly string[],
  from: string | undefined,
  step: 1 | -1,
): string | undefined {
  if (keys.length === 0) return undefined;
  const at = from === undefined ? -1 : keys.indexOf(from);
  if (at < 0) return step === 1 ? keys[0] : keys[keys.length - 1];
  return keys[at + step];
}
