// 始める場所の木を 1 本の並びに下ろす所 (`src/files/dir-tree.ts`)。
//
// 契約 `dir.tree` の `children` は 3 つの状態を持つ: 無い (歩みがそこで止まった)、
// 空 (下に何も無い)、在る。画面の振る舞いはこの 3 つで決まるので、ここで固定する。
import { describe, expect, test } from "bun:test";
import type { DirTreeEntry } from "@ccmsg/protocol";
import { dirTreeRows, graftDirTree } from "../src/files/dir-tree.ts";

const TREE: DirTreeEntry[] = [
  {
    path: "/home/kawaz/repos",
    children: [{ path: "/home/kawaz/repos/webui" }, { path: "/home/kawaz/repos/daemon" }],
  },
  { path: "/home/kawaz/notes", children: [] },
];

describe("dirTreeRows", () => {
  test("閉じている間は根だけが出て、根は綴りのまま出る", () => {
    const rows = dirTreeRows(TREE, new Set());
    expect(rows.map((row) => row.path)).toEqual(["/home/kawaz/repos", "/home/kawaz/notes"]);
    expect(rows[0]!.label).toBe("/home/kawaz/repos");
    expect(rows[0]!.depth).toBe(0);
  });

  test("開いた根の下は末尾の名前で、1 段深い所に出る", () => {
    const rows = dirTreeRows(TREE, new Set(["/home/kawaz/repos"]));
    expect(rows.map((row) => row.label)).toEqual([
      "/home/kawaz/repos",
      "webui",
      "daemon",
      "/home/kawaz/notes",
    ]);
    expect(rows[1]!.depth).toBe(1);
  });

  test("聞いていない節は開けて、下に何も無いと答えた節は開けない", () => {
    const rows = dirTreeRows(TREE, new Set(["/home/kawaz/repos"]));
    // `children` が無い = そこで歩みが止まった。開いた時に聞けばよい。
    expect(rows.find((row) => row.label === "webui")!.expandable).toBe(true);
    // `children: []` = 下に何も無いと答えてある。開く意味が無い。
    expect(rows.find((row) => row.path === "/home/kawaz/notes")!.expandable).toBe(false);
  });
});

describe("graftDirTree", () => {
  test("深く聞き直した答えがその節の下に継がれる", () => {
    const grafted = graftDirTree(TREE, "/home/kawaz/repos/webui", [
      { path: "/home/kawaz/repos/webui/src" },
    ]);
    const rows = dirTreeRows(grafted, new Set(["/home/kawaz/repos", "/home/kawaz/repos/webui"]));
    expect(rows.map((row) => row.label)).toEqual([
      "/home/kawaz/repos",
      "webui",
      "src",
      "daemon",
      "/home/kawaz/notes",
    ]);
  });

  test("継ぐ先が木に無ければ木はそのまま", () => {
    // 絞り込みで形が変わった後に前の答えが届くことがある。無理に足すと、
    // 絞り込みの結果に合わない枝が生える。
    expect(graftDirTree(TREE, "/nowhere", [{ path: "/nowhere/x" }])).toEqual(TREE);
  });
});
