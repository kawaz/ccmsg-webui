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

/** 固定の 2 人。CSS の入力をそのまま指すので、数ではなく綴りで答える。
 *
 * 名前は契約の語彙に合わせる — 固定スロットの片方は「選択中セッションの main」で、
 * `self` と呼ぶと `this` と紛れる上に、契約にはその語が無い。 */
export const MAIN = "main";
export const USER = "user";

/** 意味色と固定の 2 人から、どれだけ離れていれば別の色に見えるか。 */
const APART = 15;

/** 配ってよい空きの狭さの下限。
 *
 * 帯と帯の間に残る**狭い隙間**に配らないための線。危険 (30) と注意 (76) の間は
 * 帯を除くと 16 度しか残らず、そこに落ちた相手は琥珀色になって「注意」の色と
 * 見分けが付かない。帯から 15 度離れていることと、**その色が意味色の仲間に
 * 見えないこと**は別の条件なので、幅そのものにも下限を置く。
 *
 * どの空きも狭い時は、いちばん広い所に配る — 色が無いよりはいい。 */
const ROOMY = 30;

/** 避ける色相を名乗っている入力。ここに挙がっている色相の周り (±`APART`) には
 * 配らない — 危険の赤に見える相手や、自分と同じ紫の相手を作らないため。 */
const RESERVED = ["h-info", "h-success", "h-warning", "h-danger", "h-main", "h-user"];

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
  if (sorted.length === 0) return [{ from: 0, width: 360 }];
  // 円が 1 人で埋まっている時は、反対側が丸ごと空いている。
  if (sorted.length === 1)
    return [{ from: wrap((sorted[0] as number) + APART), width: 360 - 2 * APART }];
  const found: Gap[] = [];
  for (const [at, hue] of sorted.entries()) {
    const next = sorted[(at + 1) % sorted.length] as number;
    const width = wrap(next - hue) - 2 * APART;
    if (width > 0) found.push({ from: wrap(hue + APART), width });
  }
  return found;
}

function inside(gap: Gap, hue: number): boolean {
  return wrap(hue - gap.from) <= gap.width;
}

function widest(among: readonly Gap[]): Gap {
  return among.reduce((a, b) => (b.width > a.width ? b : a));
}

/** 相手を置いてよい所。**意味色の隣に残る狭い隙間は、はじめから無いものとして
 * 扱う** — 帯から 15 度離れていることと、その色が意味色の仲間に見えないことは
 * 別の条件なので、幅にも下限を置く。
 *
 * 狭い隙間を「空いていないこと」にするので、相手が増えて詰まってきても、そこへ
 * 落ちてくることが無い。危険と注意の間が琥珀に見えるのは混み具合とは関係が
 * 無いから、混んだ時だけ許す、にはしない。 */
function regions(reserved: readonly number[]): readonly Gap[] {
  const free = gaps(reserved);
  const roomy = free.filter((gap) => gap.width >= ROOMY);
  // どの隙間も狭い入力を選ばれた時は、いちばん広い所だけを使う。
  return roomy.length > 0 ? roomy : free.length > 0 ? [widest(free)] : [];
}

/** 置いてよい所を、既に居る相手で切り分けた残り。 */
function carve(among: readonly Gap[], peers: readonly number[]): readonly Gap[] {
  const found: Gap[] = [];
  for (const region of among) {
    const within = peers
      .map(wrap)
      .filter((hue) => inside(region, hue))
      .sort((a, b) => wrap(a - region.from) - wrap(b - region.from));
    let at = region.from;
    for (const hue of within) {
      const width = wrap(hue - at) - APART;
      if (width > 0) found.push({ from: at, width });
      at = wrap(hue + APART);
    }
    const rest = region.width - wrap(at - region.from);
    if (rest > 0) found.push({ from: at, width: rest });
  }
  return found;
}

/** 1 つ選ぶ。希望が空いていればそこ、埋まっていれば**いちばん広い空きの真ん中**
 * — 次に来る相手のために、両側を等しく残す。
 *
 * 置いてよい所が相手で埋まりきったら、切り分ける前の所へ戻って同じ選び方をする
 * (= 相手同士は近くなるが、意味色の隣には出ない)。 */
export function pickHue(
  reserved: readonly number[],
  peers: readonly number[],
  wish: number,
): number {
  const among = regions(reserved);
  if (among.length === 0) return wrap(wish);
  const carved = carve(among, peers);
  const usable = carved.length > 0 ? carved : among;
  if (usable.some((gap) => inside(gap, wish))) return wrap(wish);
  const room = widest(usable);
  return wrap(room.from + room.width / 2);
}

const held = new Map<string, number>();

/** その相手の色相。固定の 2 人は入力の名前を返し、それ以外は配った数を返す。
 *
 * 返すのが CSS の値の綴りなのは、固定の 2 人が**入力を指したまま**でいるため —
 * 設定で自分の色相を動かした時に、既に描かれている行もそのまま追う。 */
export function memberHue(key: string, root: HTMLElement = document.documentElement): string {
  if (key === MAIN) return "var(--h-main)";
  if (key === USER) return "var(--h-user)";
  const known = held.get(key);
  if (known !== undefined) return String(known);
  const hue = pickHue(standingHues(root), [...held.values()], wishedHue(key));
  held.set(key, hue);
  return String(hue);
}

/** 配った分を忘れる。test が前の test の割り当てを引き継がないために要る。 */
export function forgetMembers(): void {
  held.clear();
}
