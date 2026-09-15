import { describe, expect, test } from "bun:test";
import type { FileFindHit, Sid } from "@ccmsg/protocol";
import { fileWordOf, fileWordView } from "../src/markdown/file-word.ts";
import { FileWordIndex, findQueryFor, selectFileWordHits } from "../src/files/file-word-find.ts";

const SID = "11111111-2222-3333-4444-555555555555" as Sid;

function file(path: string): FileFindHit {
  return { path, type: "file" };
}

describe("fileWordOf", () => {
  test("ハイフンを含む語だけを拾う", () => {
    expect(fileWordOf("async-dr-and-persist")).toBe("async-dr-and-persist");
    expect(fileWordOf("docs/decisions/DR-0015-async-io-principle.md")).toBe(
      "docs/decisions/DR-0015-async-io-principle.md",
    );
    expect(fileWordOf("./sibling-notes")).toBe("./sibling-notes");
  });

  test("ハイフンの無い 1 語は拾わない", () => {
    // 強調のために backtick で囲んだだけの語。ここを拾うと、押せないものが
    // 出ないだけで済まず、語の数だけ instance に訊きに行くことになる。
    expect(fileWordOf("async")).toBeUndefined();
    expect(fileWordOf("src/main.tsx")).toBeUndefined();
  });

  test("語の一部だけが合う文は拾わない", () => {
    expect(fileWordOf("この foo-bar は")).toBeUndefined();
    expect(fileWordOf("foo-bar ")).toBeUndefined();
    expect(fileWordOf("git commit -m x")).toBeUndefined();
    // ハイフンで始まるものは option であってファイルの名前ではない。
    expect(fileWordOf("--no-hint")).toBeUndefined();
  });

  test("空の inline code は拾わない", () => {
    expect(fileWordOf("")).toBeUndefined();
    expect(fileWordOf("-")).toBeUndefined();
  });
});

describe("findQueryFor", () => {
  test("段ごとに分けて渡す (間に日付が挟まっても当たるように)", () => {
    expect(findQueryFor("async-dr-and-persist")).toBe("async-dr-and-persist");
    expect(findQueryFor("docs/issue/fold-from-head")).toBe("docs issue fold-from-head");
  });

  test("path の綴りであって名前でない段は落とす", () => {
    expect(findQueryFor("./sibling-notes")).toBe("sibling-notes");
    expect(findQueryFor("../docs/fold-from-head")).toBe("docs fold-from-head");
  });
});

describe("selectFileWordHits", () => {
  test("綴りのまま在れば、それが答えで候補は出ない", () => {
    const hits = [file("docs/issue/fold-from-head.md"), file("docs/issue/fold-from-head.ts")];
    const found = selectFileWordHits("docs/issue/fold-from-head.md", "", hits);
    expect(found.exact).toBe("docs/issue/fold-from-head.md");
    expect(found.candidates).toEqual([]);
  });

  test("綴りは書かれた場所から読む", () => {
    const hits = [file("docs/issue/fold-from-head.md")];
    expect(selectFileWordHits("issue/fold-from-head.md", "docs", hits).exact).toBe(
      "docs/issue/fold-from-head.md",
    );
    // 別の folder から同じ綴りで書かれていれば、それは別の場所を指している。
    expect(selectFileWordHits("issue/fold-from-head.md", "src", hits).exact).toBeUndefined();
  });

  test("日付 prefix と拡張子を補った名前を候補にする", () => {
    const hits = [
      file("docs/issue/2026-09-14-markdown-preview-fuzzy-file-links.md"),
      file("docs/archive/2026-01-02-markdown-preview-fuzzy-file-links.md"),
    ];
    const found = selectFileWordHits("markdown-preview-fuzzy-file-links", "", hits);
    expect(found.exact).toBeUndefined();
    expect(found.candidates).toEqual([
      "docs/archive/2026-01-02-markdown-preview-fuzzy-file-links.md",
      "docs/issue/2026-09-14-markdown-preview-fuzzy-file-links.md",
    ]);
  });

  test("名前の途中に語があるだけのものは候補にしない", () => {
    // `file.find` は path のどこかに語が在れば返す。名前として合うかどうかは
    // ここで見る — さもないと「その語を含む別の名前」が候補に並ぶ。
    const hits = [
      file("docs/fold-from-head.md"),
      file("docs/fold-from-head-with-versioned-cache.md"),
      file("src/fold-from-head/index.ts"),
    ];
    expect(selectFileWordHits("fold-from-head", "", hits).candidates).toEqual([
      "docs/fold-from-head.md",
    ]);
  });

  test("段の並びごと合うこと", () => {
    const hits = [file("docs/issue/fold-from-head.md"), file("src/issue/fold-from-head.md")];
    expect(selectFileWordHits("docs/fold-from-head", "", hits).candidates).toEqual([]);
    expect(selectFileWordHits("issue/fold-from-head", "", hits).candidates).toEqual([
      "docs/issue/fold-from-head.md",
      "src/issue/fold-from-head.md",
    ]);
  });

  test("folder は出さない", () => {
    const hits: FileFindHit[] = [
      { path: "docs/fold-from-head", type: "dir" },
      { path: "docs/fold-from-head.md", type: "file" },
    ];
    const found = selectFileWordHits("docs/fold-from-head", "", hits);
    expect(found.exact).toBeUndefined();
    expect(found.candidates).toEqual(["docs/fold-from-head.md"]);
  });

  test("書かれた場所の下に在るものが先", () => {
    const hits = [file("other/ws/notes-of-today.md"), file("here/notes-of-today.md")];
    expect(selectFileWordHits("notes-of-today", "here", hits).candidates).toEqual([
      "here/notes-of-today.md",
      "other/ws/notes-of-today.md",
    ]);
  });

  test("何も合わなければ何も出さない", () => {
    expect(selectFileWordHits("not-here-at-all", "", [file("docs/other.md")]).candidates).toEqual(
      [],
    );
  });
});

describe("fileWordView", () => {
  test("まだ分からない語と、何も無かった語は同じ見た目", () => {
    expect(fileWordView(undefined, false)).toEqual({ kind: "plain" });
    expect(fileWordView({ candidates: [] }, false)).toEqual({ kind: "plain" });
  });

  test("綴りのまま在れば単独のリンク", () => {
    expect(fileWordView({ exact: "docs/a-b.md", candidates: [] }, false)).toEqual({
      kind: "single",
      path: "docs/a-b.md",
    });
  });

  test("候補は押すまで畳んだまま、押すと開く", () => {
    const hits = { candidates: ["docs/a-b.md", "src/a-b.ts"] };
    expect(fileWordView(hits, false)).toEqual({
      kind: "candidates",
      paths: ["docs/a-b.md", "src/a-b.ts"],
      open: false,
    });
    expect(fileWordView(hits, true)).toEqual({
      kind: "candidates",
      paths: ["docs/a-b.md", "src/a-b.ts"],
      open: true,
    });
  });
});

describe("FileWordIndex", () => {
  function recorder(answer: (word: string) => FileFindHit[]) {
    const asked: { op: string; args: Record<string, unknown> }[] = [];
    const index = new FileWordIndex(async (op, args) => {
      asked.push({ op, args });
      return { sid: args["sid"], hits: answer(String(args["query"])), truncated: false };
    });
    return { asked, index };
  }

  test("同じ語は 1 度しか訊かない", async () => {
    const { asked, index } = recorder(() => [file("docs/a-b.md")]);
    expect(index.hitsFor(SID, "a-b")).toBeUndefined();
    expect(index.hitsFor(SID, "a-b")).toBeUndefined();
    await Promise.resolve();
    expect(index.hitsFor(SID, "a-b")).toEqual([file("docs/a-b.md")]);
    expect(index.hitsFor(SID, "a-b")).toEqual([file("docs/a-b.md")]);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toEqual({
      op: "file.find",
      args: { sid: SID, kind: "contained", query: "a-b" },
    });
  });

  test("答えが出たら報せる", async () => {
    const { index } = recorder(() => []);
    let told = 0;
    const stop = index.subscribe(() => {
      told += 1;
    });
    index.hitsFor(SID, "a-b");
    await Promise.resolve();
    expect(told).toBe(1);
    stop();
    index.hitsFor(SID, "c-d");
    await Promise.resolve();
    expect(told).toBe(1);
  });

  test("訊けなかった語は覚えず、次に訊かれたら訊き直す", async () => {
    let fail = true;
    const asked: string[] = [];
    const index = new FileWordIndex(async (_op, args) => {
      asked.push(String(args["query"]));
      if (fail) throw new Error("接続していません");
      return { hits: [file("docs/a-b.md")], truncated: false };
    });
    let told = 0;
    index.subscribe(() => {
      told += 1;
    });
    index.hitsFor(SID, "a-b");
    await Promise.resolve();
    await Promise.resolve();
    // 失敗は報せない (報せると、描き直しが訊き直しを呼んで止まらなくなる)。
    expect(told).toBe(0);
    fail = false;
    expect(index.hitsFor(SID, "a-b")).toBeUndefined();
    await Promise.resolve();
    await Promise.resolve();
    expect(index.hitsFor(SID, "a-b")).toEqual([file("docs/a-b.md")]);
    expect(asked).toEqual(["a-b", "a-b"]);
  });
});
