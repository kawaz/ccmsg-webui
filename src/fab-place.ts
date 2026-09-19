import { holdSection, type Section } from "./settings-section.ts";

/** 話しかける口をどこに置いて、どれだけ書けるようにしてあるか (DR-0002 の
 * section 1 つ)。
 *
 * **手で動かしたものが、そのまま覚えてある値になる**。触っている間は下書きが
 * 画面に効き (`edit`)、指を離した所で覚える (`save`) — 色や幅と違って「試して
 * みて、やっぱり保存」を挟む余地が無い操作なので、決める瞬間が指を離す所に
 * ある。
 *
 * 持つのは px 3 つだけ。効かせ方は `:root` のカスタムプロパティで、置き場も
 * 高さも CSS が読む — 位置を要素の `style` に書くと、口とその窓の 2 か所に
 * 同じ数を配ることになる。 */
export interface FabPlace {
  /** 画面の右端からの距離。 */
  readonly right?: number;
  /** 画面の下端からの距離。 */
  readonly bottom?: number;
  /** 書く所の高さ。 */
  readonly height?: number;
}

/** 口の直径。CSS にも同じ数が要るので、ここから配る。 */
export const FAB_SIZE = 56;

/** 既定は右下。`empty` が既定そのもので、覚えていないことが「既定のまま」。 */
const EMPTY: FabPlace = {};
const RIGHT = 20;
const BOTTOM = 28;
const HEIGHT = 96;

/** 書く所として意味のある高さの幅。掴んで引ける先をここに閉じる。 */
export const MIN_HEIGHT = 56;
export const MAX_HEIGHT = 480;

export function placeRight(value: FabPlace): number {
  return value.right ?? RIGHT;
}

export function placeBottom(value: FabPlace): number {
  return value.bottom ?? BOTTOM;
}

export function placeHeight(value: FabPlace): number {
  return value.height ?? HEIGHT;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

/** 画面の中に留める。覚えた時より狭い画面で開いても、口が画面の外に出ない。 */
function inView(value: FabPlace): { right: number; bottom: number } {
  const wide = globalThis.innerWidth || 0;
  const tall = globalThis.innerHeight || 0;
  return {
    right: clamp(placeRight(value), 0, Math.max(0, wide - FAB_SIZE)),
    bottom: clamp(placeBottom(value), 0, Math.max(0, tall - FAB_SIZE)),
  };
}

function readNumber(held: unknown): number | undefined {
  return typeof held === "number" && Number.isFinite(held) ? held : undefined;
}

const WORDS: Readonly<Record<string, string>> = {
  right: "右からの距離",
  bottom: "下からの距離",
  height: "書く所の高さ",
};

export const fabSection: Section<FabPlace> = {
  id: "fab",
  title: "話しかける口",
  empty: EMPTY,
  // 名前の付いた組は「複数の入力をまとめて動かす」ためのもので、ここは手で
  // 置いた 1 か所しか意味を持たない。戻す先は既定 1 つ。
  presets: [],
  parse(held) {
    if (typeof held !== "object" || held === null || Array.isArray(held)) return EMPTY;
    const row = held as { right?: unknown; bottom?: unknown; height?: unknown };
    const right = readNumber(row.right);
    const bottom = readNumber(row.bottom);
    const height = readNumber(row.height);
    return {
      ...(right === undefined ? {} : { right }),
      ...(bottom === undefined ? {} : { bottom }),
      ...(height === undefined ? {} : { height: clamp(height, MIN_HEIGHT, MAX_HEIGHT) }),
    };
  },
  format: (value) => value,
  apply(value) {
    const at = document.documentElement.style;
    const { right, bottom } = inView(value);
    at.setProperty("--fab-size", `${FAB_SIZE}px`);
    at.setProperty("--fab-right", `${right}px`);
    at.setProperty("--fab-bottom", `${bottom}px`);
    at.setProperty("--fab-prompt-height", `${placeHeight(value)}px`);
  },
  changed(draft, from) {
    const names = new Set<string>();
    if (placeRight(draft) !== placeRight(from)) names.add("right");
    if (placeBottom(draft) !== placeBottom(from)) names.add("bottom");
    if (placeHeight(draft) !== placeHeight(from)) names.add("height");
    return names;
  },
  revert(draft, from, names) {
    const next: { right?: number; bottom?: number; height?: number } = { ...draft };
    for (const name of names) {
      if (name === "right") {
        if (from.right === undefined) delete next.right;
        else next.right = from.right;
      }
      if (name === "bottom") {
        if (from.bottom === undefined) delete next.bottom;
        else next.bottom = from.bottom;
      }
      if (name === "height") {
        if (from.height === undefined) delete next.height;
        else next.height = from.height;
      }
    }
    return next;
  },
  adopt: (_draft, chosen) => chosen,
  wordFor: (name) => WORDS[name] ?? name,
};

export const fabPlace = holdSection(fabSection);

/** 手で置いた所を覚える。触っている間は `edit` で効かせ、離した所でここを通る。
 *
 * 覚えるのは**画面に見えていた所**。指は画面の外まで行けるが、そこまで覚えると
 * 次に開いた時に「置いた所」と「出る所」が食い違う。 */
export function settle(next: FabPlace): void {
  const { right, bottom } = inView(next);
  fabPlace.edit({ ...next, right, bottom });
  fabPlace.save();
}
