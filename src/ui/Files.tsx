import { computed } from "@preact/signals";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { DirEntry, Sid } from "@ccmsg/protocol";
import type { FilesView, OpenFile } from "../files/files-view.ts";
import { type FileViewMode, persistViewMode, resolveViewMode } from "../files/files-store.ts";
import { filesRouteFor } from "../files/path-link.ts";
import { useFileWords } from "../files/file-word-link.ts";
import {
  baseName,
  type FileIconKind,
  fileIconKind,
  isAbsolutePath,
  isMarkdownPath,
  joinPath,
  normalizePath,
  parentPath,
  ROOT,
  splitLines,
} from "../files/paths.ts";
import {
  detectLanguage,
  type HighlightSpan,
  isHighlightEligible,
  tokenizeLines,
} from "../markdown/highlight.ts";
import { type MarkdownPathLinker, MarkdownView } from "../markdown/markdown-view.tsx";
import { matchingKeys, type SearchWord } from "../search/in-view-search.ts";
import { run } from "../actions/tree.ts";
import { stepKey } from "../cursor.ts";
import { type FileUnit, treeUnits, unitAt, unitKey } from "../files/files-cursor.ts";
import { Holder, Pane, standOn, useAction, useScope, useScopeKeys } from "./Scope.tsx";
import { SearchBar, useInViewSearch } from "./SearchBar.tsx";
import { markedSpans, markedText } from "./search-marks.tsx";
import { href } from "../base.ts";
import type { LineRange, Route } from "../route.ts";
import { splitStorageKey } from "../layout/split-width.ts";
import { Splitter, useSplitWidth } from "./Splitter.tsx";
import { files, filesCursor, filesMemory, hello, navigate, sessionPaths } from "../state.ts";

/** A session's files: the tree on one side, the file being read on the other.
 *
 * Which file is open is the URL's to say, so opening one is a navigation and a
 * link names a file and its lines outright. Nothing here holds a second copy of
 * that: the tab reads the route and asks `FilesView` for what it names. */

export function Files({ sid, path, lines }: { sid: Sid; path?: string; lines?: LineRange }) {
  const view = files.value;
  if (view === undefined || view.sid !== sid) {
    return <p class="empty">接続するとファイルを読みます。</p>;
  }
  return <FilesBody view={view} path={path} lines={lines} />;
}

function FilesBody({ view, path, lines }: { view: FilesView; path?: string; lines?: LineRange }) {
  const session = sessionPaths(view.sid);
  const openAt = (next: Route) => {
    navigate(next);
  };
  const panes = useRef<HTMLDivElement>(null);
  const tree = useRef<HTMLDivElement>(null);
  const instance = hello.value?.instance;
  const split = useSplitWidth(instance === undefined ? undefined : splitStorageKey(instance));
  return (
    <section class="section files">
      <Pane
        name="files"
        label="ファイル"
        class="files-panes"
        hold={panes}
        style={split.width === undefined ? undefined : `--files-tree-w:${split.width}px`}
      >
        {/* 木と本文は**別々の節** (DR-0003 §2.2)。同じ上下を打っても、ツリーで
          打つのと本文の中で打つのとで届く担当が違う。 */}
        <Pane name="tree" label="ファイル" role="navigation" class="files-tree" hold={tree}>
          <TreeActions view={view} />
          <p class="files-section">プロジェクト</p>
          <DirBody view={view} dir={ROOT} depth={0} selected={path} />
          <OutsideFiles view={view} selected={path} />
        </Pane>
        <Splitter
          class="files-split"
          label="ファイルの木と本文の境目"
          width={split.width}
          measure={() => tree.current?.getBoundingClientRect().width}
          onDrag={(clientX) => {
            const box = panes.current?.getBoundingClientRect();
            if (box !== undefined) split.hold(clientX - box.left);
          }}
          onSet={split.hold}
          onSettle={split.keep}
        />
        <Pane name="preview" label="ファイルの中身" class="files-viewer">
          <Viewer view={view} path={path} lines={lines} session={session} openAt={openAt} />
        </Pane>
      </Pane>
    </section>
  );
}

/** 木が担当するアクションと、区画の役としての打鍵 (DR-0003 §2.2 の「一覧の
 * 方向キー」)。
 *
 * 辿る軸はフォルダとファイルを兼ねる 1 本で、上下はカーソルを動かすだけ。開くのは
 * 決定の時 (Enter、またはファイルの上での →) — カーソルが乗っただけで開くと、
 * 辿る途中の file を全部読みに行くことになる。
 *
 * 描くものが無いのにコンポーネントなのは、担当を名乗るのがこの節の中に居ること
 * だから。 */
function TreeActions({ view }: { view: FilesView }) {
  const scope = useScope();
  const units = treeUnits(view.tree.value, view.outside.value);
  const keys = units.map(unitKey);
  const here = (): FileUnit | undefined => unitAt(units, filesCursor.value);
  const move = (step: 1 | -1): void => {
    const to = stepKey(keys, filesCursor.value, step);
    if (to !== undefined) filesCursor.value = to;
  };
  const opened = (path: string): boolean => view.tree.value.expanded.has(path);
  useAction("files.select-prev", {
    enabled: () => units.length > 0,
    run: () => {
      move(-1);
    },
  });
  useAction("files.select-next", {
    enabled: () => units.length > 0,
    run: () => {
      move(1);
    },
  });
  // ← は「1 つ外へ」の 1 語 (§2.2 の裁定 Q13)。開いているフォルダの上では閉じ、
  // それ以外では自分を抱えているフォルダの行へ移る。
  useAction("files.collapse", {
    enabled: () => here() !== undefined,
    run: () => {
      const at = here();
      if (at === undefined) return;
      if (at.at === "dir" && opened(at.path)) {
        view.toggle(at.path);
        return;
      }
      const up = parentPath(at.path);
      if (up !== undefined && up !== ROOT) filesCursor.value = unitKey({ at: "dir", path: up });
    },
  });
  // → はフォルダなら開き、ファイルなら本文へ移る (一覧のセッションの上での →
  // が tl 本体へ移るのと同じ形)。
  useAction("files.expand", {
    enabled: () => here() !== undefined,
    run: () => {
      const at = here();
      if (at === undefined) return;
      if (at.at === "dir") {
        if (!opened(at.path)) view.toggle(at.path);
        return;
      }
      run("files.open", scope);
    },
  });
  // 区画の上では、行に効くアクションの対象は**カーソルの行**。行の中の同じ
  // アクション (その行が対象) は内側に居るので、押す所には行の方が当たる。
  useAction("files.open", {
    enabled: () => here()?.at === "file",
    run: () => {
      const at = here();
      if (at?.at !== "file") return;
      navigate({ at: "session", sid: view.sid, tab: "files", path: at.path });
      const preview = scope.parent?.child("preview");
      if (preview !== undefined) standOn(preview);
    },
  });
  useScopeKeys({
    ArrowUp: "files.select-prev",
    ArrowDown: "files.select-next",
    ArrowLeft: "files.collapse",
    ArrowRight: "files.expand",
    Enter: "files.open",
  });
  return null;
}

/** The files reached outside the browsable root.
 *
 * The contract has no op that enumerates them — the allowlist is a fact about
 * the session, consulted about a path already in hand (`file.stat`) —
 * so this is the trail of what this browser has opened rather than a listing.
 * Absolute paths, shown whole: there is no root to make them relative to. */
function OutsideFiles({ view, selected }: { view: FilesView; selected?: string }) {
  const outside = view.outside.value;
  if (outside.length === 0) return null;
  return (
    <>
      <p class="files-section">プロジェクト外</p>
      {[...outside].reverse().map((path) => (
        <FileRow key={path} path={path} label={path} depth={0} selected={selected} type="file" />
      ))}
    </>
  );
}

/** One directory's rows, or why there are none. A directory that answered an
 * error keeps the error until it is asked again — the button is the retry. */
function DirBody({
  view,
  dir,
  depth,
  selected,
}: {
  view: FilesView;
  dir: string;
  depth: number;
  selected?: string;
}) {
  const tree = view.tree.value;
  const entries = tree.dirs.get(dir);
  const failure = tree.errors.get(dir);
  if (failure !== undefined) {
    return (
      <p class="files-note error" style={indent(depth)}>
        {failure}{" "}
        <button
          type="button"
          onClick={() => {
            view.reload(dir);
          }}
        >
          再取得
        </button>
      </p>
    );
  }
  if (entries === undefined) {
    return (
      <p class="files-note" style={indent(depth)}>
        {tree.loading.has(dir) ? "読み込み中…" : "—"}
      </p>
    );
  }
  if (entries.length === 0) {
    return (
      <p class="files-note" style={indent(depth)}>
        空
      </p>
    );
  }
  return (
    <>
      {entries.map((entry) => (
        <EntryRow
          key={entry.name}
          view={view}
          dir={dir}
          entry={entry}
          depth={depth}
          selected={selected}
        />
      ))}
    </>
  );
}

function EntryRow({
  view,
  dir,
  entry,
  depth,
  selected,
}: {
  view: FilesView;
  dir: string;
  entry: DirEntry;
  depth: number;
  selected?: string;
}) {
  const path = joinPath(dir, entry.name);
  const expanded = view.tree.value.expanded.has(path);
  if (entry.type !== "dir") {
    return (
      <FileRow path={path} label={entry.name} depth={depth} selected={selected} type={entry.type} />
    );
  }
  const onCursor = filesCursor.value === unitKey({ at: "dir", path });
  return (
    <>
      <button
        type="button"
        class={`files-row${onCursor ? " on-cursor" : ""}`}
        style={indent(depth)}
        aria-expanded={expanded}
        onClick={() => {
          // 押した行がカーソルの行になる。行に効く操作の対象がカーソルの行で
          // ある以上、押した所とキーで別の行を指してはならない。
          filesCursor.value = unitKey({ at: "dir", path });
          view.toggle(path);
        }}
      >
        <span class="files-caret">{expanded ? "▾" : "▸"}</span>
        <FileGlyph kind={fileIconKind(entry.name, entry.type, expanded)} />
        <span class="files-name">{entry.name}</span>
      </button>
      {expanded && <DirBody view={view} dir={path} depth={depth + 1} selected={selected} />}
    </>
  );
}

/** One openable row.
 *
 * 行は**自分の path を対象に「ファイルを開く」を担当する** (DR-0003 §2.3 の、
 * 同じ id を場所ごとの担当が持つ形)。押す所は `<a>` のままにする — 開くことが
 * 遷移である以上、新しいタブ・リンクのコピーというブラウザの手を捨てる理由が
 * 無く、`onClick` が**アクションを起こす 1 行**であれば §2.4 は満たされる。 */
function FileRow({
  path,
  label,
  depth,
  selected,
  type,
}: {
  path: string;
  label: string;
  depth: number;
  selected?: string;
  type: DirEntry["type"];
}) {
  return (
    <Holder name={`file ${path}`}>
      <FileLink path={path} label={label} depth={depth} selected={selected} type={type} />
    </Holder>
  );
}

function FileLink({
  path,
  label,
  depth,
  selected,
  type,
}: {
  path: string;
  label: string;
  depth: number;
  selected?: string;
  type: DirEntry["type"];
}) {
  const scope = useScope();
  const at = files.value;
  const to: Route | undefined =
    at === undefined ? undefined : { at: "session", sid: at.sid, tab: "files", path };
  const cursorKey = unitKey({ at: "file", path });
  useAction("files.open", {
    enabled: () => files.value !== undefined,
    run: () => {
      filesCursor.value = cursorKey;
      if (to !== undefined) navigate(to);
    },
  });
  const onCursor = filesCursor.value === cursorKey;
  if (to === undefined) return null;
  return (
    <a
      class={`files-row${path === selected ? " files-row-on" : ""}${onCursor ? " on-cursor" : ""}`}
      style={indent(depth)}
      href={href(to)}
      aria-current={path === selected ? "true" : undefined}
      onClick={(event: MouseEvent) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        run("files.open", scope);
      }}
    >
      <span class="files-caret" />
      <FileGlyph kind={fileIconKind(baseName(path), type, false)} />
      <span class="files-name">{label}</span>
    </a>
  );
}

function indent(depth: number): Record<string, string> {
  return { "--files-depth": String(depth) };
}

/** The few glyphs a row can carry. Line art in `currentColor` so a selected
 * row's icon follows the row rather than needing a second colour rule. */
function FileGlyph({ kind }: { kind: FileIconKind }) {
  const path =
    kind === "dir-open"
      ? "M3 5h5l2 2h9v3H3zM3 10h18l-2 8H5z"
      : kind === "dir-closed"
        ? "M3 5h5l2 2h9v11H3z"
        : kind === "symlink"
          ? "M5 12a4 4 0 0 1 4-4h2M19 12a4 4 0 0 1-4 4h-2M9 12h6"
          : kind === "markdown"
            ? "M4 6h16v12H4zM7 15V9l3 3 3-3v6M17 9v6M15 13l2 2 2-2"
            : kind === "code"
              ? "M9 8l-4 4 4 4M15 8l4 4-4 4"
              : "M6 3h8l4 4v14H6zM14 3v4h4";
  return (
    <svg class="files-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={path} fill="none" stroke="currentColor" stroke-width="1.5" />
    </svg>
  );
}

function Viewer({
  view,
  path,
  lines,
  session,
  openAt,
}: {
  view: FilesView;
  path?: string;
  lines?: LineRange;
  session: { cwd?: string; root?: string };
  openAt: (route: Route) => void;
}) {
  const file = view.file.value;
  const failure = view.failure.value;
  if (path === undefined) {
    return <p class="empty">左からファイルを選ぶと中身を出します。</p>;
  }
  return (
    <>
      <p class="viewer-head">
        <span class="viewer-path mono">{path}</span>
        <button
          type="button"
          onClick={() => {
            view.refresh();
          }}
        >
          再取得
        </button>
      </p>
      {failure !== undefined && <p class="banner">{failure}</p>}
      {failure === undefined && file === undefined && <p class="empty">読み込み中…</p>}
      {file !== undefined && file.path === path && (
        <FileBody file={file} lines={lines} sid={view.sid} session={session} openAt={openAt} />
      )}
    </>
  );
}

/** How long after the last scroll the position is written down. A write per
 * wheel event would be a store write per frame; a debounce is the event
 * arriving late, not a clock being polled. */
const SCROLL_SETTLE_MS = 250;

function FileBody({
  file,
  lines,
  sid,
  session,
  openAt,
}: {
  file: OpenFile;
  lines?: LineRange;
  sid: Sid;
  session: { cwd?: string; root?: string };
  openAt: (route: Route) => void;
}) {
  const memory = useMemo(() => filesMemory(sid), [sid]);
  const markdown = isMarkdownPath(file.path);
  const [mode, setMode] = useState<FileViewMode>(() =>
    resolveViewMode(memory.read(), file.path, lines !== undefined),
  );
  // Another file, or the same file asked for at a line: both settle the mode
  // again rather than carrying over what the reader chose for the last one.
  useEffect(() => {
    setMode(resolveViewMode(memory.read(), file.path, lines !== undefined));
  }, [file.path, lines, memory]);

  const scroller = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLDivElement>(null);

  // Where the reader was. A named line range wins over it: whoever sent the
  // link was pointing at lines, not at a scroll position.
  useEffect(() => {
    const element = scroller.current;
    if (element === null) return;
    memory.write({ ...memory.read(), path: file.path });
    if (lines !== undefined) {
      anchor.current?.scrollIntoView({ block: "center" });
      return;
    }
    const top = memory.read().top;
    if (top !== undefined) element.scrollTop = top;
    else element.scrollTop = 0;
  }, [file.path, file.content, lines, memory]);

  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (settle.current !== null) clearTimeout(settle.current);
    },
    [],
  );

  const pathLinker = usePathLinker(sid, file.path, session, openAt);
  // 語が書かれた場所はこの文書が置かれている folder。外にある文書 (絶対 path)
  // には木の中での場所が無いので、その時だけ root から探す。
  const wordBase = isAbsolutePath(file.path) ? ROOT : (parentPath(file.path) ?? ROOT);
  const fileWords = useFileWords(sid, wordBase, openAt);
  const search = useInViewSearch();
  const words = search.words.value;
  // 探せるかたまりは 1 行。行だけが名前 (行番号) を持っていて、そこへ動ける。
  const units = useMemo(
    () => splitLines(file.content).map((text, at) => ({ key: String(at + 1), text })),
    [file.content],
  );
  const matched = useMemo(
    () => computed(() => matchingKeys(units, search.words.value)),
    [units, search],
  );
  const reveal = (key: string) => {
    scroller.current
      ?.querySelector(`[data-search-key="${key}"]`)
      ?.scrollIntoView({ block: "center" });
  };

  return (
    <>
      <p class="viewer-meta">
        <span class="mono">{file.size} バイト</span>
        {file.kind !== "contained" && <span class="viewer-kind">{file.kind}</span>}
        {markdown && (
          <span class="viewer-modes">
            <button
              type="button"
              class={mode === "code" ? "on" : undefined}
              onClick={() => {
                setMode("code");
                memory.write(persistViewMode(memory.read(), file.path, "code"));
              }}
            >
              コード
            </button>
            <button
              type="button"
              class={mode === "preview" ? "on" : undefined}
              onClick={() => {
                setMode("preview");
                memory.write(persistViewMode(memory.read(), file.path, "preview"));
              }}
            >
              プレビュー
            </button>
          </span>
        )}
      </p>
      <SearchBar search={search} matched={matched} onReveal={reveal} />
      <div
        class="viewer-scroll"
        ref={scroller}
        onScroll={(event) => {
          const top = (event.currentTarget as HTMLDivElement).scrollTop;
          if (settle.current !== null) clearTimeout(settle.current);
          settle.current = setTimeout(() => {
            memory.write({ ...memory.read(), path: file.path, top });
          }, SCROLL_SETTLE_MS);
        }}
      >
        {file.binary ? (
          <p class="empty">バイナリファイルです ({file.size} バイト)。</p>
        ) : markdown && mode === "preview" ? (
          <div class="viewer-preview">
            <MarkdownView
              source={file.content}
              tableOfContents
              foldSections
              pathLinker={pathLinker}
              fileWords={fileWords}
              highlight={words}
            />
          </div>
        ) : (
          <CodeLines
            path={file.path}
            content={file.content}
            lines={lines}
            anchor={anchor}
            highlight={words}
          />
        )}
      </div>
    </>
  );
}

/** 1 行の中身。色付けが届いていれば span の列を、まだなら素の文を出す。
 *
 * 探している言葉があれば、どちらの形でも同じ切り方を重ねる — 色付けの span を
 * 切り直せるので、一致が色の境界をまたいでも光らせられる。 */
function lineContent(
  text: string,
  spans: HighlightSpan[] | undefined,
  words: readonly SearchWord[],
) {
  return spans === undefined ? markedText(text, words) : markedSpans(spans, words);
}

/** Where a link inside this document opens.
 *
 * A relative link in a markdown document is relative to *that document's*
 * directory, which is the convention every markdown renderer follows and is
 * not the rule a message body goes by (there, a relative path is what the
 * session's own working directory would have read). */
function usePathLinker(
  sid: Sid,
  path: string,
  session: { cwd?: string; root?: string },
  openAt: (route: Route) => void,
): MarkdownPathLinker {
  const root = session.root ?? session.cwd;
  const dir = parentPath(path) ?? ROOT;
  const base = isAbsolutePath(dir)
    ? dir
    : root === undefined
      ? undefined
      : normalizePath(joinPath(root, dir));
  return useMemo(() => {
    const from = {
      ...(base === undefined ? {} : { cwd: base }),
      ...(root === undefined ? {} : { root }),
    };
    return (ref) => {
      const to = filesRouteFor(sid, ref, from);
      if (to === undefined) return undefined;
      return {
        href: href(to),
        onClick(event: MouseEvent) {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          openAt(to);
        },
      };
    };
  }, [sid, base, root, openAt]);
}

/** The file as numbered lines, coloured once the highlighter has arrived.
 *
 * The text is shown first and the colours land on it afterwards, the same
 * bargain `CodeBlock` makes: the grammars are the largest thing this app
 * downloads, and a file nobody opens never asks for them. */
function CodeLines({
  path,
  content,
  lines,
  anchor,
  highlight,
}: {
  path: string;
  content: string;
  lines?: LineRange;
  anchor: { current: HTMLDivElement | null };
  highlight: readonly SearchWord[];
}) {
  const language = detectLanguage(path);
  const [highlighted, setHighlighted] = useState<{
    content: string;
    rows: HighlightSpan[][];
  } | null>(null);
  useEffect(() => {
    if (!isHighlightEligible(language, content)) return;
    let cancelled = false;
    void tokenizeLines(content, language).then((rows) => {
      if (!cancelled) setHighlighted({ content, rows });
    });
    return () => {
      cancelled = true;
    };
  }, [content, language]);

  const rows = highlighted !== null && highlighted.content === content ? highlighted.rows : null;
  const plain = splitLines(content);
  const start = lines?.start;
  const end = lines?.end ?? lines?.start;

  return (
    <pre class="viewer-body mono">
      {plain.map((text, index) => {
        const number = index + 1;
        const marked = start !== undefined && end !== undefined && number >= start && number <= end;
        return (
          <div
            key={number}
            class={`viewer-line${marked ? " viewer-line-on" : ""}`}
            data-search-key={number}
            ref={number === start ? anchor : undefined}
          >
            <span class="viewer-lineno">{number}</span>
            <span class="viewer-text">{lineContent(text, rows?.[index], highlight)}</span>
          </div>
        );
      })}
    </pre>
  );
}
