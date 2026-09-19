import { describe, expect, test } from "bun:test";
import type { DirEntry } from "@ccmsg/protocol";
import { treeUnits, unitAt, unitKey } from "../src/files/files-cursor.ts";
import type { TreeState } from "../src/files/files-view.ts";
import { stepKey } from "../src/cursor.ts";

/** ファイルの木のカーソルが辿る軸 (DR-0003 §2.2 の「一覧の方向キー」)。 */

function entry(name: string, type: DirEntry["type"]): DirEntry {
  return { name, type } as DirEntry;
}

function tree(
  dirs: Record<string, readonly DirEntry[]>,
  expanded: readonly string[] = [],
): TreeState {
  return {
    expanded: new Set(expanded),
    dirs: new Map(Object.entries(dirs)),
    errors: new Map(),
    loading: new Set(),
  };
}

const DIRS = {
  "": [entry("docs", "dir"), entry("src", "dir"), entry("NOTES.md", "file")],
  docs: [entry("a.md", "file")],
  src: [entry("b.ts", "file")],
} as const;

describe("木はフォルダとファイルを兼ねて辿る", () => {
  test("開いていないフォルダの中は並ばない", () => {
    expect(treeUnits(tree(DIRS), []).map(unitKey)).toEqual([
      "dir docs",
      "dir src",
      "file NOTES.md",
    ]);
  });

  test("開いたフォルダの中は、そのフォルダの次に並ぶ", () => {
    expect(treeUnits(tree(DIRS, ["docs"]), []).map(unitKey)).toEqual([
      "dir docs",
      "file docs/a.md",
      "dir src",
      "file NOTES.md",
    ]);
  });

  test("答えがまだ届いていないフォルダは、開いていても中が並ばない", () => {
    const state = tree({ "": [entry("docs", "dir")] }, ["docs"]);
    expect(treeUnits(state, []).map(unitKey)).toEqual(["dir docs"]);
  });

  test("木の外のファイルは末尾に、画面と同じ新しい順で並ぶ", () => {
    expect(treeUnits(tree({ "": [] }), ["/tmp/old", "/tmp/new"]).map(unitKey)).toEqual([
      "file /tmp/new",
      "file /tmp/old",
    ]);
  });
});

describe("上下は端で止まる", () => {
  const keys = treeUnits(tree(DIRS, ["docs"]), []).map(unitKey);

  test("1 つ下へ", () => {
    expect(stepKey(keys, "dir docs", 1)).toBe("file docs/a.md");
  });

  test("末尾の下は無い (回り込まない)", () => {
    expect(stepKey(keys, "file NOTES.md", 1)).toBeUndefined();
  });

  test("どこにも居なければ、動かす向きの端から始める", () => {
    expect(stepKey(keys, undefined, 1)).toBe("dir docs");
    expect(stepKey(keys, undefined, -1)).toBe("file NOTES.md");
  });

  test("消えた行を指していたら、同じく端から始める", () => {
    expect(stepKey(keys, "file gone.md", 1)).toBe("dir docs");
  });
});

describe("カーソルが指しているもの", () => {
  const units = treeUnits(tree(DIRS, ["docs"]), []);

  test("名前で引ける", () => {
    expect(unitAt(units, "file docs/a.md")).toEqual({ at: "file", path: "docs/a.md" });
  });

  test("消えた行の名前には答えない", () => {
    expect(unitAt(units, "file gone.md")).toBeUndefined();
  });
});
