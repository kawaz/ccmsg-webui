import { computed, signal } from "@preact/signals";
import { type Oklch, srgb } from "./color/oklch.ts";
import { localStore } from "./settings.ts";

/** 人が色について選べること、そのぜんぶ。
 *
 * 選べるのは**層 0 の入力と、どの face で立つか**だけ (DR-0001 §2.6)。段表
 * (L / C) はここに出てこない — 文字が読めることは段表に閉じ込めてあり、そこを
 * 触らせると保証が人の手に落ちる。
 *
 * 色そのものは 1 つも計算しない。ここがするのは `:root` に入力を**書く**こと
 * だけで、段が何色になるかは CSS が解く。
 *
 * 触ることと決めることは別に持つ: 触った値は下書き (`theme`) として画面に出る
 * だけで、覚えるのは `save()` を通った時だけ (`saved`)。色は見てみないと決め
 * られないので、見るために選ぶことと、選び終えることを同じ操作にしない
 * (DR-0001 §2.7)。
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
  { name: "brand-h", kind: "hue", max: 360 },
  { name: "brand-c", kind: "chroma", max: 0.4 },
  { name: "neutral-h", kind: "hue", max: 360 },
  { name: "neutral-c", kind: "chroma", max: 0.03 },
  { name: "h-info", kind: "hue", max: 360 },
  { name: "h-success", kind: "hue", max: 360 },
  { name: "h-warning", kind: "hue", max: 360 },
  { name: "h-danger", kind: "hue", max: 360 },
  { name: "tag-h0", kind: "hue", max: 360 },
  { name: "tag-step", kind: "hue", max: 120 },
];

/** 主語の色の 2 入力。設定画面はこの 2 つを、スライダではなくカラーピッカーで
 * 選ばせる — 色を選ぶ道具は色を出すものだから。 */
export const BRAND_H = INPUTS.find((spec) => spec.name === "brand-h") as InputSpec;
export const BRAND_C = INPUTS.find((spec) => spec.name === "brand-c") as InputSpec;

/** スライダで動かす入力 (= 主語の色以外)。 */
export const SLIDERS = INPUTS.filter((spec) => spec !== BRAND_H && spec !== BRAND_C);

export function inputStep(spec: InputSpec): number {
  return spec.kind === "hue" ? 1 : 0.001;
}

/** 選ばれたもの。**選ばなかったものは入っていない** — 空の theme は「app.css の
 * ままで立つ」ことを意味し、入力を 1 つ戻すのはその項を消すことで足りる。 */
export interface Theme {
  readonly face?: Face;
  readonly inputs: Readonly<Record<string, number>>;
}

export const EMPTY: Theme = { inputs: {} };

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
  return { ...(isFace(read.face) ? { face: read.face } : {}), inputs };
}

export function formatTheme(theme: Theme): string {
  return JSON.stringify({
    ...(theme.face === undefined ? {} : { face: theme.face }),
    ...theme.inputs,
  });
}

export function clamp(spec: InputSpec, value: number): number {
  const held = Math.min(spec.max, Math.max(0, value));
  return spec.kind === "hue" ? Math.round(held) : Math.round(held * 1000) / 1000;
}

/** 名前付きの組。**中身は層 0 の入力の組でしかない** — 段表は持たないので、
 * どれを選んでも文字が読めることは崩れない (DR-0001 §2.3 / §2.8)。
 *
 * face を持たないのも決めごと: 段が face ごとの明るさを `light-dark()` の 1 行で
 * 持っている以上 (§2.4)、1 つの組は**両方の face の姿を既に持っている**。 */
export interface Preset {
  readonly id: string;
  readonly label: string;
  /** その組が何を変える所なのか。選ぶ前に読めるように、画面に添えて出す。 */
  readonly note: string;
  readonly theme: Theme;
}

/** 数を絞る。見比べたければその場で動かせるので、組が持つ意味は「ここから
 * 始める」であって「これで完成」ではない。 */
export const PRESETS: readonly Preset[] = [
  {
    id: "default",
    label: "標準",
    note: "app.css のまま。何も選んでいない状態",
    theme: EMPTY,
  },
  {
    id: "warm",
    label: "暖色",
    note: "中立に橙を混ぜ、主語の色も暖色へ",
    theme: {
      inputs: { "brand-h": 55, "brand-c": 0.13, "neutral-h": 70, "neutral-c": 0.016, "tag-h0": 30 },
    },
  },
  {
    id: "cool",
    label: "寒色",
    note: "中立に青緑を混ぜ、主語の色も寒色へ",
    theme: {
      inputs: {
        "brand-h": 205,
        "brand-c": 0.13,
        "neutral-h": 230,
        "neutral-c": 0.016,
        "tag-h0": 190,
      },
    },
  },
  {
    id: "plain",
    label: "無彩",
    note: "中立から色味を抜く。地と罫が完全な灰になる",
    theme: { inputs: { "neutral-c": 0 } },
  },
];

/** 色は「どう読みたいか」であって、どの instance を開いているかとは関係が無い
 * (DESIGN「localStorage keys name what they belong to」)。 */
const STORAGE = "ccmsg.theme";

/** 覚えてある値。**ここが変わるのは「保存」を押した時だけ**。 */
export const saved = signal<Theme>(parseTheme(localStore.get(STORAGE)));

/** 今この画面に効いている値 (下書き)。触れば即座に画面へ出るが、覚えはしない。 */
export const theme = signal<Theme>(saved.peek());

/** 選んでいる組。選んでいなければ、比べる先は覚えてある値の方。 */
export const preset = signal<string | undefined>(undefined);

/** 比べる先。「今どこから、どれだけ動かしたか」がこの 1 つで決まる。 */
export const base = computed<Theme>(() => {
  const chosen = PRESETS.find((one) => one.id === preset.value);
  return chosen === undefined ? saved.value : chosen.theme;
});

/** 覚えてある値と下書きが違うか。「保存」が押せるかはこれで決まる。 */
export const unsaved = computed<boolean>(() => changed(theme.value, saved.value).size > 0);

function preview(next: Theme): void {
  theme.value = next;
  apply(next);
}

/** `system` を選ぶことは**選ばないこと**なので、その項は残さない — 残すと
 * 「既定に戻す」が戻すものを持ったままになる。 */
export function setFace(face: Face): void {
  const { face: dropped, ...rest } = theme.value;
  void dropped;
  preview(face === "system" ? { ...rest } : { ...rest, face });
}

export function setInput(spec: InputSpec, value: number): void {
  preview({ ...theme.value, inputs: { ...theme.value.inputs, [spec.name]: clamp(spec, value) } });
}

export function choosePreset(id: string): void {
  const chosen = PRESETS.find((one) => one.id === id);
  if (chosen === undefined) return;
  preset.value = id;
  // face は組が持たない (上記)。今立っている face はそのまま連れて行く。
  const { face } = theme.value;
  preview({ ...chosen.theme, ...(face === undefined ? {} : { face }) });
}

/** 決めた所で初めて覚える。覚えた値が次のベースになるので、保存した直後は
 * 差が無い — 組を選んでいたことも、そこで役目を終える。 */
export function save(): void {
  const next = theme.value;
  saved.value = next;
  preset.value = undefined;
  localStore.set(STORAGE, formatTheme(next));
}

/** 試したものを捨てて、覚えてある値に戻す。画面を離れる時もここを通る。 */
export function discard(): void {
  preset.value = undefined;
  preview(saved.value);
}

/** ベースまで戻す。組を選んだ後で触り過ぎた時の帰り道。 */
export function resetToBase(): void {
  preview(base.value);
}

/** 差があった項の名前。入力の名前に `face` を足したものが全部で、**選んで
 * いないこと自体も 1 つの値**として比べる — 「戻す」がその項を消すことである
 * 以上、消えているかどうかが差そのもの。 */
export function changed(draft: Theme, from: Theme): ReadonlySet<string> {
  const names = new Set<string>();
  if ((draft.face ?? "system") !== (from.face ?? "system")) names.add(FACE_NAME);
  for (const spec of INPUTS) {
    if (draft.inputs[spec.name] !== from.inputs[spec.name]) names.add(spec.name);
  }
  return names;
}

/** face も 1 つの入力として数えるための名前。CSS の変数ではないので、入力の
 * 名前と衝突しない綴りを 1 か所だけ持つ。 */
export const FACE_NAME = "face";

/** 何項かをまとめてベースへ戻す。主語の色は 2 入力で 1 つの選択なので、戻すのも
 * 2 つ一緒 — 画面に出ている操作の単位と、戻す単位を揃える。
 *
 * ベースがその項を持っていなければ、消すのが戻すこと。 */
export function revert(names: readonly string[]): void {
  const from = base.value;
  let next = theme.value;
  for (const name of names) {
    if (name === FACE_NAME) {
      const { face: dropped, ...rest } = next;
      void dropped;
      next = from.face === undefined ? { ...rest } : { ...rest, face: from.face };
      continue;
    }
    const { [name]: dropped, ...rest } = next.inputs;
    void dropped;
    const held = from.inputs[name];
    next = { ...next, inputs: held === undefined ? rest : { ...rest, [name]: held } };
  }
  preview(next);
}

/** 選ばれたものを `:root` に書く。書いていない項は規則の側の値がそのまま出る
 * ので、消すのは `removeProperty` で足りる。 */
export function apply(next: Theme, root: HTMLElement = document.documentElement): void {
  if (next.face === undefined || next.face === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", next.face);
  for (const spec of INPUTS) {
    const value = next.inputs[spec.name];
    if (value === undefined) root.style.removeProperty(`--${spec.name}`);
    else root.style.setProperty(`--${spec.name}`, String(value));
  }
}

/** 今この画面に効いている値。選んでいれば選んだ値、選んでいなければ app.css の
 * 値 — 画面が実際に立っている色を出すために、**解決済みの値を読む**。 */
function standing(name: string, root: HTMLElement = document.documentElement): string {
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

/** 選ばれた色から、入力として要る 2 つ (色相と色味) を取り出す。
 *
 * **変換はブラウザにさせる** — 相対色構文で `oklch()` に直させ、解決済みの綴りを
 * 読む。sRGB と OKLCH の間の計算を JS に持つと、色の算出が CSS の外にも住む
 * ことになる (DR-0001 §2.2)。 */
function oklchOf(color: string, root: HTMLElement): Oklch | undefined {
  const probe = document.createElement("span");
  probe.style.display = "none";
  probe.style.color = `oklch(from ${color} l c h)`;
  root.append(probe);
  const said = getComputedStyle(probe).color;
  probe.remove();
  return parseOklch(said);
}

/** picker に渡す今の brand。出すのは **主語の塗りとして実際に画面に出ている色**
 * で、段が決めた明るさもそこに入っている。
 *
 * 層 2 の名前は `getPropertyValue` では解けない (登録していない custom property は
 * 書いたままの綴りで返る) ので、ここも要素に載せてブラウザに解かせる。 */
export function standingBrand(root: HTMLElement = document.documentElement): string {
  const said = oklchOf("var(--brand-fill)", root);
  return said === undefined ? "#000000" : hex(said);
}

/** picker が選んだ色を、色相と色味の 2 入力として覚える。読めない綴りは何もしない
 * — 直す相手が消えるより、選び直せる方がいい。 */
export function setBrandFromColor(
  color: string,
  root: HTMLElement = document.documentElement,
): void {
  const said = oklchOf(color, root);
  if (said === undefined) return;
  preview({
    ...theme.value,
    inputs: {
      ...theme.value.inputs,
      [BRAND_H.name]: clamp(BRAND_H, said.h),
      [BRAND_C.name]: clamp(BRAND_C, said.c),
    },
  });
}
