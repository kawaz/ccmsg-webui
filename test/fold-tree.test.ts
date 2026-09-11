// fold-tree decides, from the items alone, which folds have to be open for a
// given item to exist in the DOM — Timeline does not render a closed fold's
// body, so a search hit can no longer be found by asking the page.
//
// The contract that matters is agreement with what Timeline actually renders:
// a path naming a fold that never appears would leave a match un-reachable,
// and a missing path would leave the search thinking a hidden item was already
// on screen. An item can be inside two: the group's fold and the one it carries
// itself (a message's label, a thinking block).
import { describe, expect, test } from "bun:test";
import { buildTimeline } from "../src/timeline/items.ts";
import {
  foldGroupKey,
  foldPathsById,
  forgetFoldsOutside,
  messageFoldKey,
  rawFoldKey,
  thinkFoldKey,
} from "../src/timeline/fold-tree.ts";
import { FoldOpen } from "../src/timeline/fold-open.ts";
import type { DisplayFaces } from "../src/timeline/display.ts";
import { item, use } from "./item.ts";

const MAIN: DisplayFaces = { main: {}, sub: {} };

describe("foldPathsById", () => {
  test("畳みの中の item は、それを開く名前で引ける", () => {
    const first = use("tool.Bash", { tool_use_id: "t1", command: "ls" });
    const second = use("tool.Read", { tool_use_id: "t2", file_path: "a.ts" });
    const nodes = buildTimeline([item("message.user.in", { text: "やって" }), first, second], MAIN);
    const paths = foldPathsById(nodes);
    expect(paths.get(first.id)).toEqual([foldGroupKey([{ item: first }])]);
    expect(paths.get(second.id)).toEqual([foldGroupKey([{ item: first }])]);
  });

  test("会話はトップ層に立つが、本文は自分の畳みの中に居る", () => {
    const said = item("message.user.in", { text: "やって" });
    expect(foldPathsById(buildTimeline([said], MAIN)).get(said.id)).toEqual([
      messageFoldKey(said.id),
    ]);
  });

  test("畳みの中の会話は、外側と自分の畳みの順で引ける", () => {
    const said = item("message.user.in", { text: "やって" });
    const nodes = buildTimeline([said], { main: { message: { top: false } }, sub: {} });
    expect(foldPathsById(nodes).get(said.id)).toEqual([
      foldGroupKey([{ item: said }]),
      messageFoldKey(said.id),
    ]);
  });

  test("本文を持たない item は、外側の畳みだけ", () => {
    const alone = use("tool.Bash", { tool_use_id: "t", command: "ls" });
    const nodes = buildTimeline([item("message.user.in", { text: "やって" }), alone], MAIN);
    expect(foldPathsById(nodes).get(alone.id)).toEqual([foldGroupKey([{ item: alone }])]);
  });
});

describe("forgetFoldsOutside", () => {
  test("手放した item の開閉だけを忘れる", () => {
    const folds = new FoldOpen();
    const kept = "rec-a:0";
    const gone = "rec-b:0";
    folds.set(thinkFoldKey(kept), true);
    folds.set(thinkFoldKey(gone), true);
    folds.set(rawFoldKey("rec-a"), true);
    folds.set(rawFoldKey("rec-b"), true);
    forgetFoldsOutside(folds, new Set([kept, "rec-a"]));
    expect(folds.isOpen(thinkFoldKey(kept), false)).toBe(true);
    expect(folds.isOpen(thinkFoldKey(gone), false)).toBe(false);
    expect(folds.isOpen(rawFoldKey("rec-a"), false)).toBe(true);
    expect(folds.isOpen(rawFoldKey("rec-b"), false)).toBe(false);
  });

  test("この画面のものでない名前には手を付けない", () => {
    const folds = new FoldOpen();
    folds.set("ほかの何か", true);
    forgetFoldsOutside(folds, new Set());
    expect(folds.isOpen("ほかの何か", false)).toBe(true);
  });
});
