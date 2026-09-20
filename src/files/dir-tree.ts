/** 始められる場所の木を、画面が描ける 1 本の並びにする。
 *
 * instance が答えるのは**聞いた所の下**で、聞いた所そのものは答えに入らない
 * (契約 `dir.tree`)。根も始められる場所なので、呼ぶ側が根を節として立てて
 * その下に答えを置く。`children` が無い節は
 * **そこで歩みが止まった**という意味で、空の配列は「下に何も無い」— 開いて
 * みるまで分からないのはどちらか、を画面はこの違いだけで判断できる。
 *
 * ここに DOM は無い。開いている場所を覚えるのも、深く聞き直した答えを継ぐのも
 * 形の話なので、ブラウザの無い所で確かめられるようにしてある。 */

import type { DirTreeEntry } from "@ccmsg/protocol";

/** 描く 1 行。 */
export interface DirTreeRow {
  readonly path: string;
  /** 行に出す名前。根はそのままの綴り (どこの根かが要る)、下は末尾だけ。 */
  readonly label: string;
  readonly depth: number;
  /** 下を開ける行か。**まだ聞いていない**節も開ける — 開いた時に聞きに行く。 */
  readonly expandable: boolean;
  readonly expanded: boolean;
}

/** path の末尾。根は末尾だけだとどこの根か分からないので、呼ぶ側が渡す。 */
function tailOf(path: string): string {
  const at = path.lastIndexOf("/");
  return at === -1 || at === path.length - 1 ? path : path.slice(at + 1);
}

/** 木を、開いている所だけ下ろした 1 本の並びにする。 */
export function dirTreeRows(
  entries: readonly DirTreeEntry[],
  expanded: ReadonlySet<string>,
  depth = 0,
): DirTreeRow[] {
  const rows: DirTreeRow[] = [];
  for (const entry of entries) {
    const open = expanded.has(entry.path);
    const children = entry.children;
    rows.push({
      path: entry.path,
      label: depth === 0 ? entry.path : tailOf(entry.path),
      depth,
      // 聞いていない節 (`children` が無い) は、下に何かあるかもしれないので開ける。
      expandable: children === undefined || children.length > 0,
      expanded: open,
    });
    if (open && children !== undefined) rows.push(...dirTreeRows(children, expanded, depth + 1));
  }
  return rows;
}

/** 深く聞き直した答えを木に継ぐ。
 *
 * 継ぐ先が見つからなければ木はそのまま — 絞り込みで形が変わった後に前の答えが
 * 届くことがあり、その時に無理やり足すと、絞り込みの結果に合わない枝が生える。 */
export function graftDirTree(
  entries: readonly DirTreeEntry[],
  path: string,
  children: readonly DirTreeEntry[],
): DirTreeEntry[] {
  return entries.map((entry) => {
    if (entry.path === path) return { ...entry, children: [...children] };
    if (entry.children === undefined) return entry;
    return { ...entry, children: graftDirTree(entry.children, path, children) };
  });
}
