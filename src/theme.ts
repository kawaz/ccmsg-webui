import { signal } from "@preact/signals";
import { type Oklch, srgb } from "./color/oklch.ts";
import { localStore } from "./settings.ts";

/** 人が色について選べること、そのぜんぶ。
 *
 * 選べるのは**層 0 の入力と、どの face で立つか**だけ (DR-0001 §2.5)。段表
 * (L / C) はここに出てこない — 文字が読めることは段表に閉じ込めてあり、そこを
 * 触らせると保証が人の手に落ちる。
 *
 * 色そのものは 1 つも計算しない。ここがするのは `:root` に入力を**書く**こと
 * だけで、段が何色になるかは CSS が解く。
 *
 * 既定を持たないのも同じ理由による: 何も選んでいない時に出るのは `app.css` が
 * 書いてある値で、この module はそれを読んで見せる。数をこちらにも書けば、
 * 片方を直した時にもう片方が古いまま残る。 */

export const FACES = ["system", "light", "dark"] as const;
/** どの face で立つか。`system` は OS に従う (= 何も選んでいない)。 */
export type Face = (typeof FACES)[number];

function isFace(value: unknown): value is Face {
  return typeof value === "string" && (FACES as readonly string[]).includes(value);
}

/** 人が動かせる入力。名前は CSS の名前そのままで、`--` だけ落としてある。
 *
 * ここに無い層 0 の値 (`--semantic-c`、識別の族の明るさ) は、どれも「どのくらい
 * 目立つか」の設計値で、色相のように選び直すものではない。 */
export interface InputSpec {
  readonly name: string;
  /** 色相は度、色味は C。範囲と刻みが違うだけで、扱いは同じ。 */
  readonly kind: "hue" | "chroma";
  readonly max: number;
}

export const INPUTS: readonly InputSpec[] = [
  { name: "neutral-h", kind: "hue", max: 360 },
  { name: "neutral-c", kind: "chroma", max: 0.03 },
  { name: "h-info", kind: "hue", max: 360 },
  { name: "h-success", kind: "hue", max: 360 },
  { name: "h-warning", kind: "hue", max: 360 },
  { name: "h-danger", kind: "hue", max: 360 },
  { name: "tag-h0", kind: "hue", max: 360 },
  { name: "tag-step", kind: "hue", max: 120 },
];

export function inputStep(spec: InputSpec): number {
  return spec.kind === "hue" ? 1 : 0.001;
}

/** 選ばれたもの。**選ばなかったものは入っていない** — 空の theme は「app.css の
 * ままで立つ」ことを意味し、入力を 1 つ戻すのはその項を消すことで足りる。 */
export interface Theme {
  readonly face?: Face;
  /** 主語の色。色として持つのは、カラーピッカーで選べるのが色だから — 効くのは
   * その色相と色味で、L は段表が上書きする。 */
  readonly brand?: string;
  readonly inputs: Readonly<Record<string, number>>;
}

export const EMPTY: Theme = { inputs: {} };

/** `#rrggbb` の 7 文字だけを受ける。picker が書くのはこの綴りで、手で書き換え
 * られた値まで解釈する理由が無い。 */
const HEX = /^#[0-9a-f]{6}$/i;

/** 覚えていた theme。読めない所は**その項だけ**捨てる — 1 つ壊れた値のために
 * 選んだ色ぜんぶを失うより、その項が app.css に戻る方がいい。 */
export function parseTheme(raw: string | undefined): Theme {
  if (raw === undefined) return EMPTY;
  let held: unknown;
  try {
    held = JSON.parse(raw);
  } catch {
    return EMPTY;
  }
  if (typeof held !== "object" || held === null) return EMPTY;
  const read = held as Record<string, unknown>;
  const inputs: Record<string, number> = {};
  for (const spec of INPUTS) {
    const value = read[spec.name];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    inputs[spec.name] = clamp(spec, value);
  }
  const brand = read.brand;
  return {
    ...(isFace(read.face) ? { face: read.face } : {}),
    ...(typeof brand === "string" && HEX.test(brand) ? { brand } : {}),
    inputs,
  };
}

export function formatTheme(theme: Theme): string {
  return JSON.stringify({
    ...(theme.face === undefined ? {} : { face: theme.face }),
    ...(theme.brand === undefined ? {} : { brand: theme.brand }),
    ...theme.inputs,
  });
}

export function clamp(spec: InputSpec, value: number): number {
  const held = Math.min(spec.max, Math.max(0, value));
  return spec.kind === "hue" ? Math.round(held) : Math.round(held * 1000) / 1000;
}

/** 色は「どう読みたいか」であって、どの instance を開いているかとは関係が無い
 * (DESIGN「localStorage keys name what they belong to」)。 */
const STORAGE = "ccmsg.theme";

export const theme = signal<Theme>(parseTheme(localStore.get(STORAGE)));

function keep(next: Theme): void {
  theme.value = next;
  localStore.set(STORAGE, formatTheme(next));
  apply(next);
}

/** `system` を選ぶことは**選ばないこと**なので、その項は残さない — 残すと
 * 「既定に戻す」が戻すものを持ったままになる。 */
export function setFace(face: Face): void {
  const { face: dropped, ...rest } = theme.value;
  void dropped;
  keep(face === "system" ? { ...rest } : { ...rest, face });
}

export function setBrand(hex: string): void {
  keep({ ...theme.value, brand: hex });
}

export function setInput(spec: InputSpec, value: number): void {
  keep({ ...theme.value, inputs: { ...theme.value.inputs, [spec.name]: clamp(spec, value) } });
}

/** 選んだものを捨てて app.css に戻す。1 項だけ戻すのも、ぜんぶ戻すのも同じ道。 */
export function clearTheme(): void {
  keep(EMPTY);
}

export function clearInput(spec: InputSpec): void {
  const { [spec.name]: dropped, ...rest } = theme.value.inputs;
  void dropped;
  keep({ ...theme.value, inputs: rest });
}

export function clearBrand(): void {
  const { brand: dropped, ...rest } = theme.value;
  void dropped;
  keep({ ...rest });
}

/** 選ばれたものを `:root` に書く。書いていない項は規則の側の値がそのまま出る
 * ので、消すのは `removeProperty` で足りる。 */
export function apply(next: Theme, root: HTMLElement = document.documentElement): void {
  if (next.face === undefined || next.face === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", next.face);
  if (next.brand === undefined) root.style.removeProperty("--brand");
  else root.style.setProperty("--brand", next.brand);
  for (const spec of INPUTS) {
    const value = next.inputs[spec.name];
    if (value === undefined) root.style.removeProperty(`--${spec.name}`);
    else root.style.setProperty(`--${spec.name}`, String(value));
  }
}

/** 今この画面に効いている値。選んでいれば選んだ値、選んでいなければ app.css の
 * 値 — 画面が実際に立っている色を出すために、**解決済みの値を読む**。 */
export function standing(name: string, root: HTMLElement = document.documentElement): string {
  return getComputedStyle(root).getPropertyValue(`--${name}`).trim();
}

export function standingNumber(spec: InputSpec, root?: HTMLElement): number {
  const value = Number(standing(spec.name, root));
  return Number.isFinite(value) ? value : 0;
}

/** `oklch(L C H)` を読む。色を計算するためではなく、**picker に初期値を渡す**
 * ため — picker が扱えるのは sRGB の 16 進なので、そこまでは連れて行く。 */
export function parseOklch(value: string): Oklch | undefined {
  const said = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(value);
  if (said === null) return undefined;
  return { l: Number(said[1]), c: Number(said[2]), h: Number(said[3]) };
}

export function hex(color: Oklch): string {
  const said = srgb(color)
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
  return `#${said}`;
}

/** picker に渡す今の brand。選んでいればその 16 進、選んでいなければ app.css の
 * oklch を sRGB まで連れて行った値。 */
export function standingBrand(root?: HTMLElement): string {
  const chosen = theme.value.brand;
  if (chosen !== undefined) return chosen;
  const said = parseOklch(standing("brand", root));
  return said === undefined ? "#000000" : hex(said);
}
