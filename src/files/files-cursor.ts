import type { TreeState } from "./files-view.ts";
import { joinPath, ROOT } from "./paths.ts";

/** ファイルの木のカーソルが辿るもの (DR-0003 §2.2)。
 *
 * **フォルダとファイルを 1 つの軸で兼ねて辿る**。畳んだフォルダが 1 単位に見える
 * ことが人の目に映っている通りで、一覧のセクションとセッションを兼ねるのと同じ
 * 理由 (`src/sessions-cursor.ts`)。
 *
 * ここに画面は出てこない — 何が並んでいるかと、どういう順かだけ。 */

export type FileUnit =
  | { readonly at: "dir"; readonly path: string }
  | { readonly at: "file"; readonly path: string };

export function unitKey(unit: FileUnit): string {
  return `${unit.at} ${unit.path}`;
}

/** 今並んでいる行を、上から順に 1 本の軸へ。
 *
 * **開いていないフォルダの中は並ばない** — 目に見えていない行にカーソルが入ると、
 * 押した上下が画面のどこも動かさない。まだ答えが届いていないフォルダも同じで、
 * 中身が無いので並べようがない。
 *
 * 末尾に付くのは木の外で開いたファイル (`outside`)。画面がそこを新しい順に出す
 * ので、軸も同じ向きで並べる — 目に見えている順と辿る順がずれると、上下が飛ぶ。 */
export function treeUnits(tree: TreeState, outside: readonly string[]): readonly FileUnit[] {
  const units: FileUnit[] = [];
  const walk = (dir: string): void => {
    for (const entry of tree.dirs.get(dir) ?? []) {
      const path = joinPath(dir, entry.name);
      if (entry.type !== "dir") {
        units.push({ at: "file", path });
        continue;
      }
      units.push({ at: "dir", path });
      if (tree.expanded.has(path)) walk(path);
    }
  };
  walk(ROOT);
  for (const path of [...outside].reverse()) units.push({ at: "file", path });
  return units;
}

/** カーソルが今指しているもの。名前だけ覚えているので、行が消えれば答えも消える。 */
export function unitAt(units: readonly FileUnit[], key: string | undefined): FileUnit | undefined {
  return units.find((unit) => unitKey(unit) === key);
}
