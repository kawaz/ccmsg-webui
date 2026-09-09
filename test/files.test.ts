import { describe, expect, test } from "bun:test";
import {
  filesStorageKey,
  parseFilesRecord,
  persistViewMode,
  resolveViewMode,
  withOutsidePath,
} from "../src/files/files-store.ts";
import { filesRouteFor } from "../src/files/path-link.ts";
import {
  ancestorsOf,
  baseName,
  displayPathFor,
  fileIconKind,
  isMarkdownPath,
  joinPath,
  normalizePath,
  parentPath,
  sortEntries,
  splitLines,
} from "../src/files/paths.ts";
import { formatLineRange, parseLineRange, parseRoute, routePath } from "../src/route.ts";

const SID = "11111111-2222-3333-4444-555555555555";

describe("paths", () => {
  test("normalizePath collapses . and ..", () => {
    expect(normalizePath("/a/b/../c/./d")).toBe("/a/c/d");
    expect(normalizePath("a//b/../c")).toBe("a/c");
    expect(normalizePath("/../a")).toBe("/a");
    expect(normalizePath("../a")).toBe("../a");
  });

  test("joinPath treats the contained root as the empty string", () => {
    expect(joinPath("", "src")).toBe("src");
    expect(joinPath("src", "app.ts")).toBe("src/app.ts");
    expect(joinPath("/", "etc")).toBe("/etc");
    expect(joinPath("/a", "b")).toBe("/a/b");
  });

  test("parentPath and ancestorsOf walk to the right root", () => {
    expect(parentPath("a/b/c")).toBe("a/b");
    expect(parentPath("a")).toBe("");
    expect(parentPath("")).toBeUndefined();
    expect(parentPath("/a")).toBe("/");
    expect(parentPath("/")).toBeUndefined();
    expect(ancestorsOf("src/ui/App.tsx")).toEqual(["", "src", "src/ui"]);
    expect(ancestorsOf("/a/b")).toEqual(["/", "/a"]);
  });

  test("baseName", () => {
    expect(baseName("a/b.txt")).toBe("b.txt");
    expect(baseName("b.txt")).toBe("b.txt");
    expect(baseName("")).toBe("");
  });

  test("sortEntries puts directories first, then names", () => {
    const sorted = sortEntries([
      { name: "b.ts", type: "file" },
      { name: "zz", type: "dir" },
      { name: "a.ts", type: "file" },
      { name: "aa", type: "dir" },
    ]);
    expect(sorted.map((entry) => entry.name)).toEqual(["aa", "zz", "a.ts", "b.ts"]);
  });

  test("displayPathFor keeps what is inside the root relative", () => {
    const session = { cwd: "/repo/main/pkg", root: "/repo/main" };
    expect(displayPathFor("docs/x.md", session)).toBe("pkg/docs/x.md");
    expect(displayPathFor("/repo/main/README.md", session)).toBe("README.md");
    expect(displayPathFor("/etc/hosts", session)).toBe("/etc/hosts");
    expect(displayPathFor("../../outside.txt", session)).toBe("/repo/outside.txt");
  });

  test("displayPathFor gives up on a relative path with no working directory", () => {
    expect(displayPathFor("docs/x.md", {})).toBeUndefined();
    expect(displayPathFor("/abs", {})).toBe("/abs");
  });

  test("fileIconKind", () => {
    expect(fileIconKind("src", "dir", false)).toBe("dir-closed");
    expect(fileIconKind("src", "dir", true)).toBe("dir-open");
    expect(fileIconKind("a.md", "file", false)).toBe("markdown");
    expect(fileIconKind("a.ts", "file", false)).toBe("code");
    expect(fileIconKind(".gitignore", "file", false)).toBe("file");
    expect(fileIconKind("link", "symlink", false)).toBe("symlink");
  });

  test("isMarkdownPath", () => {
    expect(isMarkdownPath("docs/DESIGN-ja.md")).toBe(true);
    expect(isMarkdownPath("a.markdown")).toBe(true);
    expect(isMarkdownPath("a.mdx")).toBe(false);
  });

  test("splitLines drops only the segment a trailing newline creates", () => {
    expect(splitLines("a\nb\n")).toEqual(["a", "b"]);
    expect(splitLines("a\nb")).toEqual(["a", "b"]);
    expect(splitLines("")).toEqual([""]);
    expect(splitLines("a\n\n")).toEqual(["a", ""]);
  });
});

describe("URL の path / lines", () => {
  test("parseLineRange", () => {
    expect(parseLineRange("12")).toEqual({ start: 12 });
    expect(parseLineRange("12-20")).toEqual({ start: 12, end: 20 });
    // 逆順は打ち間違いとして扱い、起点だけ残す
    expect(parseLineRange("20-12")).toEqual({ start: 20 });
    expect(parseLineRange("0")).toBeUndefined();
    expect(parseLineRange("x")).toBeUndefined();
    expect(parseLineRange(null)).toBeUndefined();
  });

  test("formatLineRange", () => {
    expect(formatLineRange({ start: 3 })).toBe("3");
    expect(formatLineRange({ start: 3, end: 3 })).toBe("3");
    expect(formatLineRange({ start: 3, end: 9 })).toBe("3-9");
  });

  test("files タブだけが path / lines を読む", () => {
    expect(parseRoute(`/s/${SID}/files`, "?path=src/a.ts&lines=3-9")).toEqual({
      at: "session",
      sid: SID,
      tab: "files",
      path: "src/a.ts",
      lines: { start: 3, end: 9 },
    });
    expect(parseRoute(`/s/${SID}/timeline`, "?path=src/a.ts")).toEqual({
      at: "session",
      sid: SID,
      tab: "timeline",
    });
  });

  test("routePath は往復する", () => {
    const route = parseRoute(`/s/${SID}/files`, "?path=a%20b/c.md&lines=4");
    expect(route).toEqual({
      at: "session",
      sid: SID,
      tab: "files",
      path: "a b/c.md",
      lines: { start: 4 },
    });
    const printed = routePath(route);
    expect(parseRoute(printed.split("?")[0]!, printed.slice(printed.indexOf("?")))).toEqual(route);
  });

  test("path のないファイルタブは query を付けない", () => {
    expect(routePath({ at: "session", sid: SID, tab: "files" })).toBe(`/s/${SID}/files`);
  });
});

describe("filesRouteFor", () => {
  const session = { cwd: "/repo/main", root: "/repo/main" };

  test("行番号つきの参照はその行を指す", () => {
    expect(filesRouteFor(SID, { path: "src/a.ts", line: 3, end: 9 }, session)).toEqual({
      at: "session",
      sid: SID,
      tab: "files",
      path: "src/a.ts",
      lines: { start: 3, end: 9 },
    });
  });

  test("根の外は絶対パスのまま開く", () => {
    expect(filesRouteFor(SID, { path: "/etc/hosts" }, session)?.path).toBe("/etc/hosts");
  });

  test("解決できない相対参照はリンクにしない", () => {
    expect(filesRouteFor(SID, { path: "src/a.ts" }, {})).toBeUndefined();
  });
});

describe("files の記録", () => {
  test("キーは instance と sid の両方を名前に含む", () => {
    expect(filesStorageKey("inst", SID)).toBe(`ccmsg.files:inst:${SID}`);
  });

  test("壊れた値は「記録なし」に落ちる", () => {
    expect(parseFilesRecord(undefined)).toEqual({});
    expect(parseFilesRecord("{")).toEqual({});
    expect(parseFilesRecord("null")).toEqual({});
    expect(parseFilesRecord('{"path":3,"view":"x","top":-1,"outside":[1,"/a"]}')).toEqual({
      outside: ["/a"],
    });
  });

  test("プロジェクト外の履歴は重複せず最後が最新", () => {
    const one = withOutsidePath({}, "/a");
    const two = withOutsidePath(one, "/b");
    expect(withOutsidePath(two, "/a").outside).toEqual(["/b", "/a"]);
  });

  test("markdown の表示モードはセッション単位の最後の選択", () => {
    const record = { view: "preview" as const };
    expect(resolveViewMode(record, "a.md", false)).toBe("preview");
    // 行を名指しされたリンクはコード側を見せる (プレビューに行番号は無い)
    expect(resolveViewMode(record, "a.md", true)).toBe("code");
    expect(resolveViewMode(record, "a.ts", false)).toBe("code");
    expect(resolveViewMode({}, "a.md", false)).toBe("preview");
  });

  test("markdown でないファイルを開いても選択は消えない", () => {
    const record = { view: "preview" as const };
    expect(persistViewMode(record, "a.ts", "code")).toEqual(record);
    expect(persistViewMode(record, "a.md", "code").view).toBe("code");
  });
});
