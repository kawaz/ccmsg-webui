// 型付き item を画面の並びに読むところ。契約が決めているのは型の名前と
// `parent_item` の指し先だけなので、ここで固定するのはその 2 つから決まること
// — 呼び出しと答えがどう結ばれるか、続いた item がどう畳まれるか、そして知らない
// 型が落ちずに出るか。
import { describe, expect, test } from "bun:test";
import {
  buildTimeline,
  foldShouldOpen,
  nodeKey,
  nodeRows,
  ownFields,
  recordRange,
} from "../src/timeline/items.ts";
import {
  foldLabel,
  isGeneric,
  itemDetail,
  itemLabel,
  itemProse,
  rowText,
} from "../src/timeline/item-view.ts";
import type { DisplayFaces } from "../src/timeline/display.ts";
import { item, result, use } from "./item.ts";

/** 何も付けていない main の面 = 組み込みの既定だけ。 */
const MAIN: DisplayFaces = { main: {}, sub: {} };

describe("buildTimeline", () => {
  test("会話と思考はそれ自身で 1 つ、続いたそれ以外は 1 つの畳みになる", () => {
    const nodes = buildTimeline(
      [
        item("message.user.in", { text: "やって" }),
        item("thinking", { text: "考える" }),
        use("tool.Bash", { tool_use_id: "t1", command: "ls" }),
        use("tool.Read", { tool_use_id: "t2", file_path: "a.ts" }),
        item("message.user.out", { text: "やった" }),
      ],
      MAIN,
    );
    expect(nodes.map((node) => node.kind)).toEqual(["row", "row", "fold", "row"]);
    expect(nodeRows(nodes[2]!).length).toBe(2);
  });

  test("直後に来た答えは呼び出しの中に畳まれ、離れた答えは来た所に残る", () => {
    const call = use("tool.Bash", { tool_use_id: "t1", command: "ls" });
    const answer = result("tool.Bash", call, { stdout: "a\nb" });
    const near = buildTimeline([call, answer], MAIN);
    expect(near.length).toBe(1);
    expect(nodeRows(near[0]!)[0]?.result).toBe(answer);

    const far = buildTimeline([call, item("message.user.out", { text: "待つ" }), answer], MAIN);
    expect(far.length).toBe(3);
    expect(nodeRows(far[0]!)[0]?.result).toBeUndefined();
  });

  test("agent への依頼の答えは、何を挟んでも依頼の中に畳まれる", () => {
    const brief = use("message.sub.out", { prompt: "調べて", name: "scout" });
    const answer = result("message.sub.in", brief, { text: "調べた", agent_id: "a1" });
    const nodes = buildTimeline([brief, item("thinking", { text: "待つ" }), answer], MAIN);
    expect(nodes.length).toBe(2);
    expect(nodeRows(nodes[0]!)[0]?.result).toBe(answer);
  });

  test("範囲の外に居る呼び出しを指す答えは、それ自身として出る", () => {
    const orphan = item("tool.Bash", {
      role: "result",
      parent_item: "居ない:0",
      parent_tool_use_id: "t9",
      stdout: "x",
    });
    const nodes = buildTimeline([orphan], MAIN);
    expect(nodes.length).toBe(1);
    expect(nodeKey(nodes[0]!)).toBe(orphan.id);
  });

  test("呼び出しの id を持たない答えも、harness の鍵で呼び出しに結ばれる", () => {
    const call = use("tool.Bash", { tool_use_id: "t1", command: "ls" });
    // instance が呼び出しを読めていない答えは `tool.unknown` として届く。
    const answer = result("tool.unknown", { tool_use_id: "t1" }, { result: { stdout: "a" } });
    const nodes = buildTimeline([call, answer], MAIN);
    expect(nodes.length).toBe(1);
    expect(nodeRows(nodes[0]!)[0]?.result).toBe(answer);
  });
});

describe("表示属性が並びを決める", () => {
  const rows = [
    item("message.user.in", { text: "やって" }),
    use("tool.Bash", { tool_use_id: "t1", command: "ls" }),
  ];

  test("トップ層から外した型は、隣の畳みに入る", () => {
    const nodes = buildTimeline(rows, { main: { "message.user.in": { top: false } }, sub: {} });
    expect(nodes.map((node) => node.kind)).toEqual(["fold"]);
    expect(nodeRows(nodes[0]!).length).toBe(2);
  });

  test("トップ層に上げた型は、畳みから出て自分で立つ", () => {
    const nodes = buildTimeline(rows, { main: { tool: { top: true } }, sub: {} });
    expect(nodes.map((node) => node.kind)).toEqual(["row", "row"]);
  });

  test("面は item が名乗る主語で決まる — 同じ並びに両方の面が出る", () => {
    // `sub` の既定は道具をトップ層に並べる、`main` は畳みに入れる。同じ
    // `tool.Bash` が、どちらの主語で読まれたかだけで別の所に立つ。
    const nodes = buildTimeline(
      [
        use("tool.Bash", { tool_use_id: "t1", command: "ls", subject: "main" }),
        use("tool.Bash", { tool_use_id: "t2", command: "ls", subject: "sub" }),
      ],
      MAIN,
    );
    expect(nodes.map((node) => node.kind)).toEqual(["fold", "row"]);
  });

  test("契約の 3 つ目の主語 `team` は、持ち場を任された側として sub の面で読む", () => {
    const nodes = buildTimeline(
      [use("tool.Bash", { tool_use_id: "t1", command: "ls", subject: "team" })],
      MAIN,
    );
    expect(nodes.map((node) => node.kind)).toEqual(["row"]);
  });

  test("畳みは、中に開く型が 1 つでも居れば開く", () => {
    const bash = [{ item: use("tool.Bash", { tool_use_id: "t", command: "ls" }) }];
    expect(foldShouldOpen(bash, MAIN)).toBe(false);
    expect(foldShouldOpen(bash, { main: { "tool.Bash": { open: true } }, sub: {} })).toBe(true);
    // 上の型に付けた値も効く。
    expect(foldShouldOpen(bash, { main: { tool: { open: true } }, sub: {} })).toBe(true);
  });
});

describe("畳みの見出し", () => {
  test("何行畳まれているか", () => {
    const rows = [
      { item: use("tool.Agent", { tool_use_id: "t", prompt: "p" }) },
      { item: use("tool.Bash", { tool_use_id: "u", command: "ls" }) },
    ];
    expect(foldLabel(rows)).toBe("2 item");
  });

  test("汎用形は別に数える (読めていない item が中に居ることが見出しで分かる)", () => {
    const rows = [
      { item: use("tool.Bash", { tool_use_id: "t", command: "ls" }) },
      { item: item("system.unknown", { record: {} }) },
    ];
    expect(foldLabel(rows)).toBe("2 item (1 汎用形)");
  });
});

// 型が言うのは主語から見た関係 (親・teammate) で、相手そのものの名前は型に
// 出ない。名乗りに出すのは harness が付けた名前の方。
describe("会話の相手の名乗り", () => {
  test("harness が名前を付けていればそれを出す", () => {
    expect(itemLabel(item("message.team.out", { text: "", harness_name: "impl-greedy" }))).toBe(
      "→ impl-greedy",
    );
    expect(itemLabel(item("message.parent.in", { text: "", harness_name: "team-lead" }))).toBe(
      "← team-lead",
    );
  });

  test("名前が無ければ、主語から見た関係で呼ぶ", () => {
    expect(itemLabel(item("message.parent.in", { text: "" }))).toBe("← 親");
    expect(itemLabel(item("message.parent.out", { text: "" }))).toBe("→ 親");
    expect(itemLabel(item("message.team.out", { text: "" }))).toBe("→ teammate");
  });
});

describe("知らない型も出る", () => {
  test("専用の見た目が無い型は、型名と自分の field で出る", () => {
    const one = item("tool.MysteryTool", {
      role: "use",
      tool_use_id: "t",
      input: { knob: 3 },
    });
    expect(isGeneric(one)).toBe(true);
    expect(itemLabel(one)).toBe("MysteryTool");
    expect(itemDetail(one)).toContain("knob");
    expect(itemProse(one)).toBeUndefined();
  });

  test("読めなかった record は未分類として、record ごと出る", () => {
    const one = item("system.unknown", { record: { type: "なにか", text: "中身" } });
    expect(isGeneric(one)).toBe(true);
    expect(itemLabel(one)).toBe("未分類");
    expect(itemDetail(one)).toContain("中身");
  });

  test("専用の見た目を持つ道具は汎用形ではない", () => {
    expect(isGeneric(use("tool.Bash", { tool_use_id: "t", command: "ls" }))).toBe(false);
    expect(isGeneric(item("message.user.in", { text: "" }))).toBe(false);
  });

  test("共通の field は「その item だけのもの」に入らない", () => {
    const own = ownFields(use("tool.Bash", { tool_use_id: "t", command: "ls" }));
    expect(Object.keys(own).sort()).toEqual(["command"]);
  });
});

describe("探す対象", () => {
  test("画面に出ている名乗りと中身が、そのまま探す対象になる", () => {
    const call = use("tool.Bash", { tool_use_id: "t", command: "echo こんにちは" });
    const answer = result("tool.Bash", call, { stdout: "こんにちは" });
    expect(rowText({ item: call, result: answer })).toContain("echo こんにちは");
    expect(rowText({ item: call, result: answer })).toContain("Bash の結果");
  });

  test("会話は書かれた文そのものが対象", () => {
    expect(rowText({ item: item("message.user.in", { text: "やって" }) })).toBe("人 やって");
  });
});

describe("元の record の住所", () => {
  test("item が指す 1 行だけを頼む形になる", () => {
    const one = item("thinking", { text: "" }, { offset: 400, bytes: 120 });
    expect(recordRange(one)).toEqual({ before: 520, max_bytes: 120 });
  });
});
