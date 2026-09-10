// 型付き item を画面の並びに読むところ。契約が決めているのは型の名前と
// `parent_item` の指し先だけなので、ここで固定するのはその 2 つから決まること
// — 呼び出しと答えがどう結ばれるか、続いた item がどう畳まれるか、そして知らない
// 型が落ちずに出るか。
import { describe, expect, test } from "bun:test";
import {
  buildTimeline,
  foldNeedsOuterFold,
  itemCategory,
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
import { item, result, use } from "./item.ts";

describe("buildTimeline", () => {
  test("会話と思考はそれ自身で 1 つ、続いたそれ以外は 1 つの畳みになる", () => {
    const nodes = buildTimeline([
      item("message:user:in", { text: "やって" }),
      item("thinking", { text: "考える" }),
      use("tool:Bash", { tool_use_id: "t1", command: "ls" }),
      use("tool:Read", { tool_use_id: "t2", file_path: "a.ts" }),
      item("message:user:out", { text: "やった" }),
    ]);
    expect(nodes.map((node) => node.kind)).toEqual(["row", "row", "fold", "row"]);
    expect(nodeRows(nodes[2]!).length).toBe(2);
  });

  test("直後に来た答えは呼び出しの中に畳まれ、離れた答えは来た所に残る", () => {
    const call = use("tool:Bash", { tool_use_id: "t1", command: "ls" });
    const answer = result("tool:Bash", call, { stdout: "a\nb" });
    const near = buildTimeline([call, answer]);
    expect(near.length).toBe(1);
    expect(nodeRows(near[0]!)[0]?.result).toBe(answer);

    const far = buildTimeline([call, item("message:user:out", { text: "待つ" }), answer]);
    expect(far.length).toBe(3);
    expect(nodeRows(far[0]!)[0]?.result).toBeUndefined();
  });

  test("agent への依頼の答えは、何を挟んでも依頼の中に畳まれる", () => {
    const brief = use("message:sub:out", { prompt: "調べて", name: "scout" });
    const answer = result("message:sub:in", brief, { text: "調べた", agent_id: "a1" });
    const nodes = buildTimeline([brief, item("thinking", { text: "待つ" }), answer]);
    expect(nodes.length).toBe(2);
    expect(nodeRows(nodes[0]!)[0]?.result).toBe(answer);
  });

  test("範囲の外に居る呼び出しを指す答えは、それ自身として出る", () => {
    const orphan = item("tool:Bash", {
      role: "result",
      parent_item: "居ない:0",
      parent_tool_use_id: "t9",
      stdout: "x",
    });
    const nodes = buildTimeline([orphan]);
    expect(nodes.length).toBe(1);
    expect(nodeKey(nodes[0]!)).toBe(orphan.id);
  });

  test("呼び出しの id を持たない答えも、harness の鍵で呼び出しに結ばれる", () => {
    const call = use("tool:Bash", { tool_use_id: "t1", command: "ls" });
    // instance が呼び出しを読めていない答えは `tool:unknown` として届く。
    const answer = result("tool:unknown", { tool_use_id: "t1" }, { result: { stdout: "a" } });
    const nodes = buildTimeline([call, answer]);
    expect(nodes.length).toBe(1);
    expect(nodeRows(nodes[0]!)[0]?.result).toBe(answer);
  });
});

describe("畳みの見た目", () => {
  test("中身が 1 つの item だけなら外側の畳みは出さない", () => {
    const alone = [{ item: use("tool:Bash", { tool_use_id: "t", command: "ls" }) }];
    expect(foldNeedsOuterFold(alone)).toBe(false);
    expect(foldNeedsOuterFold([...alone, ...alone])).toBe(true);
    // agent 通信は 1 つでも畳みを出す: 何が畳まれているかが見出しに要る。
    expect(
      foldNeedsOuterFold([{ item: use("tool:Agent", { tool_use_id: "t", prompt: "p" }) }]),
    ).toBe(true);
  });

  test("見出しは軸ごとの数を決まった順で並べる", () => {
    const rows = [
      { item: item("thinking", { text: "a" }) },
      { item: use("tool:Agent", { tool_use_id: "t", prompt: "p" }) },
      { item: use("tool:Bash", { tool_use_id: "u", command: "ls" }) },
    ];
    expect(foldLabel(rows)).toBe("1 思考 + 1 agent 通信 + 1 item");
  });

  test("汎用形は別に数える (読めていない item が中に居ることが見出しで分かる)", () => {
    const rows = [
      { item: use("tool:Bash", { tool_use_id: "t", command: "ls" }) },
      { item: item("system:unknown", { record: {} }) },
    ];
    expect(foldLabel(rows)).toBe("1 item + 1 汎用形");
  });
});

describe("itemCategory", () => {
  test("4 つの軸は型の名前から決まる", () => {
    expect(itemCategory(item("thinking", { text: "" }))).toBe("thinking");
    expect(itemCategory(item("message:session:in", { text: "" }))).toBe("ccmsg");
    expect(itemCategory(use("message:sub:out", { prompt: "" }))).toBe("agent");
    expect(itemCategory(use("tool:Agent", { tool_use_id: "t", prompt: "" }))).toBe("agent");
    expect(itemCategory(use("tool:Bash", { tool_use_id: "t", command: "ls" }))).toBe("other");
    expect(itemCategory(item("message:user:in", { text: "" }))).toBe("other");
  });
});

describe("知らない型も出る", () => {
  test("専用の見た目が無い型は、型名と自分の field で出る", () => {
    const one = item("tool:MysteryTool", {
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
    const one = item("system:unknown", { record: { type: "なにか", text: "中身" } });
    expect(isGeneric(one)).toBe(true);
    expect(itemLabel(one)).toBe("未分類");
    expect(itemDetail(one)).toContain("中身");
  });

  test("専用の見た目を持つ道具は汎用形ではない", () => {
    expect(isGeneric(use("tool:Bash", { tool_use_id: "t", command: "ls" }))).toBe(false);
    expect(isGeneric(item("message:user:in", { text: "" }))).toBe(false);
  });

  test("共通の field は「その item だけのもの」に入らない", () => {
    const own = ownFields(use("tool:Bash", { tool_use_id: "t", command: "ls" }));
    expect(Object.keys(own).sort()).toEqual(["command"]);
  });
});

describe("探す対象", () => {
  test("画面に出ている名乗りと中身が、そのまま探す対象になる", () => {
    const call = use("tool:Bash", { tool_use_id: "t", command: "echo こんにちは" });
    const answer = result("tool:Bash", call, { stdout: "こんにちは" });
    expect(rowText({ item: call, result: answer })).toContain("echo こんにちは");
    expect(rowText({ item: call, result: answer })).toContain("Bash の結果");
  });

  test("会話は書かれた文そのものが対象", () => {
    expect(rowText({ item: item("message:user:in", { text: "やって" }) })).toBe("人 やって");
  });
});

describe("元の record の住所", () => {
  test("item が指す 1 行だけを頼む形になる", () => {
    const one = item("thinking", { text: "" }, { offset: 400, bytes: 120 });
    expect(recordRange(one)).toEqual({ before: 520, max_bytes: 120 });
  });
});
