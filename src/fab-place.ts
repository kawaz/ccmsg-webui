import { holdSection, type Section } from "./settings-section.ts";

/** 話しかける口をどこに置いて、どれだけ書けるようにしてあるか (DR-0002 の
 * section 1 つ)。
 *
 * **覚えるのは近い側の辺と、そこからの距離**。素の x, y で覚えると、画面が
 * 変わった時 (端末の回転、窓の幅を変えた、ソフトキーボードが出た) に口が置いた
 * 隅から離れ、狭くなった側では画面の外へ出る。辺を覚えていれば、右下に置いた
 * ものはどの大きさでも右下に居る。
 *
 * **手で動かしたものが、そのまま覚えてある値になる**。触っている間は下書きが
 * 画面に効き (`edit`)、指を離した所で覚える (`save`) — 色や幅と違って「試して
 * みて、やっぱり保存」を挟む余地が無い操作なので、決める瞬間が指を離す所に
 * ある。
 *
 * 効かせ方は `:root` のカスタムプロパティで、口も、口に付く窓も、書く所も CSS が
 * 読む — 位置を要素の `style` に書くと、同じ数を 2 か所へ配ることになる。 */

/** 横はどちらの辺から測るか。 */
export type SideX = "left" | "right";
/** 縦はどちらの辺から測るか。 */
export type SideY = "top" | "bottom";

export interface FabPlace {
  readonly sideX?: SideX;
  readonly sideY?: SideY;
  /** `sideX` の辺からの距離。 */
  readonly x?: number;
  /** `sideY` の辺からの距離。 */
  readonly y?: number;
  /** 書く所の高さ。覚えていない間は中身に合わせて伸びる (`field-sizing`)。 */
  readonly height?: number;
}

/** 口の直径。CSS にも同じ数が要るので、ここから配る。 */
export const FAB_SIZE = 56;

/** 既定は右下。`empty` が既定そのもので、覚えていないことが「既定のまま」。 */
const EMPTY: FabPlace = {};
const EDGE = 20;

/** 掴んで引ける高さの幅。 */
export const MIN_HEIGHT = 56;
export const MAX_HEIGHT = 480;

export function sideX(value: FabPlace): SideX {
  return value.sideX ?? "right";
}

export function sideY(value: FabPlace): SideY {
  return value.sideY ?? "bottom";
}

export function placeX(value: FabPlace): number {
  return value.x ?? EDGE;
}

export function placeY(value: FabPlace): number {
  return value.y ?? EDGE;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

/** 今見えている所。**layout viewport ではなく visual viewport** を見る —
 * ソフトキーボードが出ている間、`position: fixed` の座標系は変わらないのに
 * 見えている高さだけが縮むので、そこへ収めないと口がキーボードの下に隠れる。 */
export function seen(): { left: number; top: number; width: number; height: number } {
  const vv = globalThis.visualViewport;
  return {
    left: vv?.offsetLeft ?? 0,
    top: vv?.offsetTop ?? 0,
    width: vv?.width ?? globalThis.innerWidth ?? 0,
    height: vv?.height ?? globalThis.innerHeight ?? 0,
  };
}

/** 画面の左上からの座標を、近い側の辺とそこからの距離に直す。
 *
 * どちらの辺が近いかは**置いた所で決まる**: 右半分に置いたものは右から測る。
 * 窓が広がった時に口が真ん中へ流れていかないのは、この判定があるから。 */
export function toEdges(left: number, top: number): FabPlace {
  const view = seen();
  const width = Math.max(0, view.width - FAB_SIZE);
  const height = Math.max(0, view.height - FAB_SIZE);
  const x = clamp(left - view.left, 0, width);
  const y = clamp(top - view.top, 0, height);
  return {
    sideX: x * 2 < width ? "left" : "right",
    sideY: y * 2 < height ? "top" : "bottom",
    x: Math.round(x * 2 < width ? x : width - x),
    y: Math.round(y * 2 < height ? y : height - y),
  };
}

function readNumber(held: unknown): number | undefined {
  return typeof held === "number" && Number.isFinite(held) ? held : undefined;
}

const WORDS: Readonly<Record<string, string>> = {
  x: "横の位置",
  y: "縦の位置",
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
    const row = held as {
      sideX?: unknown;
      sideY?: unknown;
      x?: unknown;
      y?: unknown;
      height?: unknown;
    };
    const kindX = row.sideX === "left" || row.sideX === "right" ? row.sideX : undefined;
    const kindY = row.sideY === "top" || row.sideY === "bottom" ? row.sideY : undefined;
    const x = readNumber(row.x);
    const y = readNumber(row.y);
    const height = readNumber(row.height);
    return {
      ...(kindX === undefined ? {} : { sideX: kindX }),
      ...(kindY === undefined ? {} : { sideY: kindY }),
      ...(x === undefined ? {} : { x: Math.max(0, x) }),
      ...(y === undefined ? {} : { y: Math.max(0, y) }),
      ...(height === undefined ? {} : { height: clamp(height, MIN_HEIGHT, MAX_HEIGHT) }),
    };
  },
  format: (value) => value,
  apply(value) {
    const at = document.documentElement.style;
    at.setProperty("--fab-size", `${FAB_SIZE}px`);
    // 覚えていない間は**何も書かない** — 既定の隅は CSS が持っていて、そこには
    // safe-area (ホームインジケータや丸い角) を避ける余白が入っている。
    if (value.x === undefined || value.y === undefined) {
      for (const name of ["--fab-left", "--fab-top", "--fab-right", "--fab-bottom"]) {
        at.removeProperty(name);
      }
    } else {
      // 覚えてあるのは辺からの距離。今見えている所の辺から測り直して、左上の
      // 座標 1 組に直す — 置く時に効く辺が 2 通りあると、どちらが勝つかを
      // CSS と JS の両方が知っていることになる。
      const view = seen();
      const room = {
        x: Math.max(0, view.width - FAB_SIZE),
        y: Math.max(0, view.height - FAB_SIZE),
      };
      const x = clamp(placeX(value), 0, room.x);
      const y = clamp(placeY(value), 0, room.y);
      at.setProperty("--fab-left", `${view.left + (sideX(value) === "left" ? x : room.x - x)}px`);
      at.setProperty("--fab-top", `${view.top + (sideY(value) === "top" ? y : room.y - y)}px`);
      at.setProperty("--fab-right", "auto");
      at.setProperty("--fab-bottom", "auto");
    }
    // 覚えていない間は高さを決め打ちにしない — 中身に合わせて伸びる方に任せる。
    if (value.height === undefined) at.removeProperty("--fab-prompt-height");
    else at.setProperty("--fab-prompt-height", `${value.height}px`);
  },
  changed(draft, from) {
    const names = new Set<string>();
    if (sideX(draft) !== sideX(from) || placeX(draft) !== placeX(from)) names.add("x");
    if (sideY(draft) !== sideY(from) || placeY(draft) !== placeY(from)) names.add("y");
    if (draft.height !== from.height) names.add("height");
    return names;
  },
  revert(draft, from, names) {
    const next: {
      sideX?: SideX;
      sideY?: SideY;
      x?: number;
      y?: number;
      height?: number;
    } = { ...draft };
    for (const name of names) {
      if (name === "x") {
        if (from.sideX === undefined) delete next.sideX;
        else next.sideX = from.sideX;
        if (from.x === undefined) delete next.x;
        else next.x = from.x;
      }
      if (name === "y") {
        if (from.sideY === undefined) delete next.sideY;
        else next.sideY = from.sideY;
        if (from.y === undefined) delete next.y;
        else next.y = from.y;
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

/** 手で置いた所を覚える。触っている間は `edit` で効かせ、離した所でここを通る。 */
export function settle(next: FabPlace): void {
  fabPlace.edit(next);
  fabPlace.save();
}

/** 見えている所が変わったら置き直す (端末の回転、窓の大きさ、ソフトキーボード)。
 *
 * 覚えてある値は辺からの距離なので変わらない — 変わるのは、その距離がどこから
 * 測られるかだけ。だから**覚え直さない**: ここで `save` すると、キーボードが
 * 出るたびに人が置いた覚えを上書きしてしまう。 */
export function followViewport(): () => void {
  const again = () => {
    fabSection.apply(fabPlace.draft.peek());
  };
  const vv = globalThis.visualViewport;
  globalThis.addEventListener("resize", again);
  vv?.addEventListener("resize", again);
  vv?.addEventListener("scroll", again);
  return () => {
    globalThis.removeEventListener("resize", again);
    vv?.removeEventListener("resize", again);
    vv?.removeEventListener("scroll", again);
  };
}
