import { type Oklch, srgb } from "./color/oklch.ts";
import { keepOnSignOut, localStore } from "./settings.ts";
import { holdSection, type Preset, type Section } from "./settings-section.ts";

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
 * (DR-0001 §2.10)。
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
 * 意味色と誰かの色の**色味**もここに居る。テーマによって発色の強さが違う以上
 * (Catppuccin Latte の C 0.21 と Nord の 0.08)、組がそれを連れて来られないと
 * 名前だけ借りた別のテーマになる。
 *
 * ここに無い層 0 の値 (識別の族の明るさ) は「どのくらい目立つか」の設計値で、
 * 色相のように選び直すものではない。 */
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
  { name: "neutral-c", kind: "chroma", max: 0.12 },
  { name: "h-info", kind: "hue", max: 360 },
  { name: "h-success", kind: "hue", max: 360 },
  { name: "h-warning", kind: "hue", max: 360 },
  { name: "h-danger", kind: "hue", max: 360 },
  { name: "h-main", kind: "hue", max: 360 },
  { name: "h-user", kind: "hue", max: 360 },
  { name: "semantic-c", kind: "chroma", max: 0.3 },
  { name: "member-c", kind: "chroma", max: 0.3 },
  { name: "tag-h0", kind: "hue", max: 360 },
  { name: "tag-step", kind: "hue", max: 120 },
];

/** 主語の色の 2 入力。設定画面はこの 2 つを、スライダではなくカラーピッカーで
 * 選ばせる — 色を選ぶ道具は色を出すものだから。 */
export const BRAND_H = INPUTS.find((spec) => spec.name === "brand-h") as InputSpec;
export const BRAND_C = INPUTS.find((spec) => spec.name === "brand-c") as InputSpec;

/** 基本で選ぶ色相。主語の色と合わせて、**人が選ぶのはこの 3 つの色相と face
 * だけ**で足りるようにしてある — 残りは既定のまま導かれる。
 *
 * この 2 つが基本に居るのは、誰が言ったかが読む速さに直に効くから。中立の温度や
 * 意味色の色相は、選ばなくても画面が成立する。 */
export const IDENTITY = INPUTS.filter((spec) => spec.name === "h-main" || spec.name === "h-user");

/** 詳細に出る入力。基本に出ているものはここに出ない — 同じ値を動かす操作子が
 * 2 つあると、名乗りの同じ操作子が画面に 2 度並ぶ (読み上げる人には区別が付か
 * ない)。基本と詳細は同じ 1 つの入力の組を**分けて**並べたもので、写したもの
 * ではない。 */
export const ADVANCED = INPUTS.filter(
  (spec) => spec !== BRAND_H && spec !== BRAND_C && !IDENTITY.includes(spec),
);

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
export function parseTheme(held: unknown): Theme {
  if (typeof held !== "object" || held === null || Array.isArray(held)) return EMPTY;
  const read = held as Record<string, unknown>;
  const inputs: Record<string, number> = {};
  for (const spec of INPUTS) {
    const value = read[spec.name];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    inputs[spec.name] = clamp(spec, value);
  }
  return { ...(isFace(read.face) ? { face: read.face } : {}), inputs };
}

export function formatTheme(theme: Theme): unknown {
  return {
    ...(theme.face === undefined ? {} : { face: theme.face }),
    ...theme.inputs,
  };
}

export function clamp(spec: InputSpec, value: number): number {
  const held = Math.min(spec.max, Math.max(0, value));
  return spec.kind === "hue" ? Math.round(held) : Math.round(held * 1000) / 1000;
}

/** 数を絞る。見比べたければその場で動かせるので、組が持つ意味は「ここから
 * 始める」であって「これで完成」ではない。
 *
 * **中身は層 0 の入力の組でしかない** — 段表は持たないので、どれを選んでも
 * 文字が読めることは崩れない (DR-0001 §2.3 / §2.11)。face を持たないのも決め
 * ごと: 段が face ごとの明るさを `light-dark()` の 1 行で持っている以上
 * (§2.4)、1 つの組は**両方の face の姿を既に持っている**。
 *
 * 組が動かすのは**色相と彩度と中立の色味の 3 つとも**で、色相だけではない —
 * 色相しか違わない組を並べると、選び直しても画面が同じ濃さのまま立っていて、
 * 「別の組を選んだ」ことが画面に出ない。 */
export const PRESETS: readonly Preset<Theme>[] = [
  {
    id: "default",
    label: "標準",
    value: EMPTY,
  },
  {
    id: "solarized-light",
    label: "Solarized Light",
    value: {
      face: "light",
      inputs: {
        "brand-h": 245,
        "brand-c": 0.139,
        "neutral-h": 92,
        "neutral-c": 0.087,
        "h-main": 279,
        "h-user": 356,
        "h-info": 245,
        "h-success": 119,
        "h-warning": 86,
        "h-danger": 27,
        "semantic-c": 0.158,
        "member-c": 0.164,
        "tag-h0": 245,
      },
    },
  },
  {
    id: "solarized-dark",
    label: "Solarized Dark",
    value: {
      face: "dark",
      inputs: {
        "brand-h": 245,
        "brand-c": 0.139,
        "neutral-h": 220,
        "neutral-c": 0.12,
        "h-main": 279,
        "h-user": 356,
        "h-info": 245,
        "h-success": 119,
        "h-warning": 86,
        "h-danger": 27,
        "semantic-c": 0.158,
        "member-c": 0.164,
        "tag-h0": 245,
      },
    },
  },
  {
    id: "nord",
    label: "Nord",
    value: {
      face: "dark",
      inputs: {
        "brand-h": 218,
        "brand-c": 0.062,
        "neutral-h": 267,
        "neutral-c": 0.097,
        "h-main": 333,
        "h-user": 38,
        "h-info": 249,
        "h-success": 131,
        "h-warning": 84,
        "h-danger": 15,
        "semantic-c": 0.086,
        "member-c": 0.079,
        "tag-h0": 218,
      },
    },
  },
  {
    id: "dracula",
    label: "Dracula",
    value: {
      face: "dark",
      inputs: {
        "brand-h": 302,
        "brand-c": 0.149,
        "neutral-h": 278,
        "neutral-c": 0.107,
        "h-main": 347,
        "h-user": 67,
        "h-info": 213,
        "h-success": 148,
        "h-warning": 113,
        "h-danger": 24,
        "semantic-c": 0.163,
        "member-c": 0.154,
        "tag-h0": 302,
      },
    },
  },
  {
    id: "gruvbox-light",
    label: "Gruvbox Light",
    value: {
      face: "light",
      inputs: {
        "brand-h": 200,
        "brand-c": 0.066,
        "neutral-h": 89,
        "neutral-c": 0.12,
        "h-main": 344,
        "h-user": 155,
        "h-info": 216,
        "h-success": 107,
        "h-warning": 71,
        "h-danger": 28,
        "semantic-c": 0.125,
        "member-c": 0.103,
        "tag-h0": 200,
      },
    },
  },
  {
    id: "gruvbox-dark",
    label: "Gruvbox Dark",
    value: {
      face: "dark",
      inputs: {
        "brand-h": 170,
        "brand-c": 0.042,
        "neutral-h": 49,
        "neutral-c": 0.023,
        "h-main": 2,
        "h-user": 52,
        "h-info": 170,
        "h-success": 111,
        "h-warning": 83,
        "h-danger": 30,
        "semantic-c": 0.144,
        "member-c": 0.14,
        "tag-h0": 170,
      },
    },
  },
  {
    id: "catppuccin-latte",
    label: "Catppuccin Latte",
    value: {
      face: "light",
      inputs: {
        "brand-h": 262,
        "brand-c": 0.226,
        "neutral-h": 265,
        "neutral-c": 0.03,
        "h-main": 297,
        "h-user": 338,
        "h-info": 235,
        "h-success": 140,
        "h-warning": 68,
        "h-danger": 20,
        // 公式の平均は 0.172 だが、段 11 の弱い文字がこの組の色相で 4.5 を
        // 0.0015 割る。段表を動かさない以上、頭打ちになるのは写す側。
        "semantic-c": 0.165,
        "member-c": 0.212,
        "tag-h0": 262,
      },
    },
  },
  {
    id: "catppuccin-mocha",
    label: "Catppuccin Mocha",
    value: {
      face: "dark",
      inputs: {
        "brand-h": 260,
        "brand-c": 0.111,
        "neutral-h": 282,
        "neutral-c": 0.107,
        "h-main": 305,
        "h-user": 336,
        "h-info": 210,
        "h-success": 143,
        "h-warning": 87,
        "h-danger": 3,
        "semantic-c": 0.098,
        "member-c": 0.097,
        "tag-h0": 260,
      },
    },
  },
  {
    id: "github-light",
    label: "GitHub Light",
    value: {
      face: "light",
      inputs: {
        "brand-h": 258,
        "brand-c": 0.191,
        "neutral-h": 248,
        "neutral-c": 0.01,
        "h-main": 295,
        "h-user": 348,
        "h-info": 258,
        "h-success": 148,
        "h-warning": 75,
        "h-danger": 25,
        "semantic-c": 0.163,
        "member-c": 0.197,
        "tag-h0": 258,
      },
    },
  },
  {
    id: "github-dark",
    label: "GitHub Dark",
    value: {
      face: "dark",
      inputs: {
        "brand-h": 253,
        "brand-c": 0.152,
        "neutral-h": 257,
        "neutral-c": 0.053,
        "h-main": 299,
        "h-user": 350,
        "h-info": 253,
        "h-success": 146,
        "h-warning": 80,
        "h-danger": 27,
        "semantic-c": 0.17,
        "member-c": 0.173,
        "tag-h0": 253,
      },
    },
  },
];

/** face も 1 つの入力として数えるための名前。CSS の変数ではないので、入力の
 * 名前と衝突しない綴りを 1 か所だけ持つ。 */
export const FACE_NAME = "face";

const LABELS: Readonly<Record<string, string>> = {
  [FACE_NAME]: "light か dark か",
  "brand-h": "主語の色 (押せるもの・選ばれているもの)",
  "brand-c": "主語の色の色味",
  "neutral-h": "中立に混ぜる色味の色相",
  "neutral-c": "中立に混ぜる色味の強さ",
  "h-info": "知らせ (info) の色相",
  "h-success": "うまくいっている (success) の色相",
  "h-warning": "注意 (warning) の色相",
  "h-danger": "危険 (danger) の色相",
  "h-main": "メインの色相 (このセッションが言ったこと)",
  "h-user": "ユーザの色相 (人が言ったこと)",
  "semantic-c": "意味色 4 つの色味",
  "member-c": "誰かの色の色味",
  "tag-h0": "識別の族の始まりの色相",
  "tag-step": "識別の族の色相の間隔",
};

export function wordFor(name: string): string {
  return LABELS[name] ?? name;
}

/** 色がこの文書の中で名乗る名前。
 *
 * 文書に入る前は `ccmsg.theme` 1 つで覚えていたので、文書にこの部分がまだ無い
 * 端末ではそちらを読む。**読むだけ**で、書くのは文書の側だけ — 次に保存した
 * 時点で新しい場所に移る。 */
const SECTION = "colour";
const FORMER = keepOnSignOut("ccmsg.theme");

function readColour(held: unknown): Theme {
  if (held !== undefined) return parseTheme(held);
  const raw = localStore.get(FORMER);
  if (raw === undefined) return EMPTY;
  try {
    return parseTheme(JSON.parse(raw));
  } catch {
    return EMPTY;
  }
}

/** 色の section。設定の仕組み (`src/settings-section.ts`) が知っているのはこの
 * 形だけで、何が入力かはここが言う。 */
export const colourSection: Section<Theme> = {
  id: SECTION,
  title: "色",
  empty: EMPTY,
  presets: PRESETS,
  parse: readColour,
  format: formatTheme,
  apply,
  wordFor,
  changed(draft, from) {
    const names = new Set<string>();
    if ((draft.face ?? "system") !== (from.face ?? "system")) names.add(FACE_NAME);
    for (const spec of INPUTS) {
      if (draft.inputs[spec.name] !== from.inputs[spec.name]) names.add(spec.name);
    }
    return names;
  },
  revert(draft, from, names) {
    let next = draft;
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
    return next;
  },
  // 組が face を言っていれば、それがその組の姿。言っていない組 (標準) を選んだ
  // 時だけ、今立っている face をそのまま連れて行く。
  adopt(draft, chosen) {
    if (chosen.face !== undefined) return chosen;
    return { ...chosen, ...(draft.face === undefined ? {} : { face: draft.face }) };
  },
};

export const colour = holdSection(colourSection);

/** 今この画面に効いている色 (下書き)。 */
export const theme = colour.draft;

export function setFace(face: Face): void {
  const { face: dropped, ...rest } = theme.value;
  void dropped;
  colour.edit(face === "system" ? { ...rest } : { ...rest, face });
}

export function setInput(spec: InputSpec, value: number): void {
  colour.edit({
    ...theme.value,
    inputs: { ...theme.value.inputs, [spec.name]: clamp(spec, value) },
  });
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
  colour.edit({
    ...theme.value,
    inputs: {
      ...theme.value.inputs,
      [BRAND_H.name]: clamp(BRAND_H, said.h),
      [BRAND_C.name]: clamp(BRAND_C, said.c),
    },
  });
}
