/** 誰が言ったかの色相を配る所。
 *
 * 色そのものは 1 つも作らない — 段も色味も `app.css` の `--member-*` が持って
 * いて、ここが答えるのは**色相 1 つ**だけ。identity が色相で、強弱が段という
 * 分け方なので、配る側が知るべきものもそれしかない。
 *
 * 選べるのは固定の 2 人分 (自分とユーザ) で、この 2 つは設定の入力そのものを
 * 指す。それ以外の相手は初めて出てきた時に空いている色相へ置き、**以後動かない**
 * — 参加者が増えるたびに既に読んでいる行の色が変わると、色で人を覚えられない。
 *
 * 配る先は webui 全体で 1 つ。開いているセッションによって同じ相手の色が変わる
 * と、並べて読んでいる人が同じ相手を 2 人だと思う。 */

/** 固定の 2 人。CSS の入力をそのまま指すので、数ではなく綴りで答える。 */
export const SELF = "self";
export const USER = "user";

/** 意味色と固定の 2 人から、どれだけ離れていれば別の色に見えるか。 */
const APART = 15;

/** 避ける色相を名乗っている入力。ここに挙がっている色相の周り (±`APART`) には
 * 配らない — 危険の赤に見える相手や、自分と同じ紫の相手を作らないため。 */
const RESERVED = ["h-info", "h-success", "h-warning", "h-danger", "h-self", "h-user"];

/** `:root` に立っている色相を読む。CSS が正本なので、既定値をここにも書かない。 */
function standingHues(root: HTMLElement): readonly number[] {
  const style = getComputedStyle(root);
  return RESERVED.map((name) => Number(style.getPropertyValue(`--${name}`))).filter((hue) =>
    Number.isFinite(hue),
  );
}

/** 名前から希望の色相を作る。同じ名前なら同じ色相を希望するので、世代を跨いで
 * 立ち上がり直したセッションが同じ色から始まる。 */
export function wishedHue(seed: string): number {
  let held = 0;
  for (const code of seed) held = (held * 31 + (code.codePointAt(0) ?? 0)) % 360;
  return held;
}

/** 空いている区間。円周なので、始まりより終わりが小さい区間もある。 */
interface Gap {
  readonly from: number;
  readonly width: number;
}

function wrap(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

/** 埋まっている色相を避けた残り。それぞれの色相は前後 `APART` を連れている。 */
function gaps(taken: readonly number[]): readonly Gap[] {
  const sorted = [...taken].map(wrap).sort((a, b) => a - b);
  const found: Gap[] = [];
  for (const [at, hue] of sorted.entries()) {
    const next = sorted[(at + 1) % sorted.length] as number;
    const from = hue + APART;
    const width = wrap(next - hue) - 2 * APART;
    // 円が 1 人で埋まっている時は、反対側が丸ごと空いている。
    if (sorted.length === 1) found.push({ from, width: 360 - 2 * APART });
    else if (width > 0) found.push({ from: wrap(from), width });
  }
  return found;
}

function inside(gap: Gap, hue: number): boolean {
  return wrap(hue - gap.from) <= gap.width;
}

/** 埋まっている色相を避けて 1 つ選ぶ。希望が空いていればそこ、埋まっていれば
 * **いちばん広い空きの真ん中** — 次に来る相手のために、両側を等しく残す。 */
export function pickHue(taken: readonly number[], wish: number): number {
  if (taken.length === 0) return wrap(wish);
  const free = gaps(taken);
  // 円が埋まりきったら、いちばん近い相手から遠い所を選ぶしかない。
  if (free.length === 0) return wrap(wish + 180);
  const held = free.find((gap) => inside(gap, wish));
  if (held !== undefined) return wrap(wish);
  const widest = free.reduce((a, b) => (b.width > a.width ? b : a));
  return wrap(widest.from + widest.width / 2);
}

const held = new Map<string, number>();

/** その相手の色相。固定の 2 人は入力の名前を返し、それ以外は配った数を返す。
 *
 * 返すのが CSS の値の綴りなのは、固定の 2 人が**入力を指したまま**でいるため —
 * 設定で自分の色相を動かした時に、既に描かれている行もそのまま追う。 */
export function memberHue(key: string, root: HTMLElement = document.documentElement): string {
  if (key === SELF) return "var(--h-self)";
  if (key === USER) return "var(--h-user)";
  const known = held.get(key);
  if (known !== undefined) return String(known);
  const hue = pickHue([...standingHues(root), ...held.values()], wishedHue(key));
  held.set(key, hue);
  return String(hue);
}

/** 配った分を忘れる。test が前の test の割り当てを引き継がないために要る。 */
export function forgetMembers(): void {
  held.clear();
}
