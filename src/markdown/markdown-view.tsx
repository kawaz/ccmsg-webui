// mdast -> preact JSX renderer for the text a turn is made of.
// `mdast-util-from-markdown` (micromark) returns a standard mdast tree; this
// module walks it into JSX by hand rather than through any mdast-to-HTML-string
// stage, and never uses `innerHTML`/`dangerouslySetInnerHTML` — every
// renderable value reaches the DOM as a JSX text node, so Preact's own escaping
// is what protects against markdown content containing `<`/`&`/quotes.
import { h, createContext, type VNode } from "preact";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmStrikethroughFromMarkdown } from "mdast-util-gfm-strikethrough";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import { gfmTaskListItemFromMarkdown } from "mdast-util-gfm-task-list-item";
import { gfmStrikethrough } from "micromark-extension-gfm-strikethrough";
import { gfmTable } from "micromark-extension-gfm-table";
import { gfmTaskListItem } from "micromark-extension-gfm-task-list-item";
import type {
  Blockquote,
  Code,
  Delete,
  Emphasis,
  Heading,
  Html,
  Image,
  InlineCode,
  Link,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
  Strong,
  Table,
  Text,
} from "mdast";
import { CodeBlock } from "../ui/CodeBlock.tsx";
import { type SearchWord, splitForHighlight } from "../search/in-view-search.ts";
import { classifyMarkdownLinkUrl, type FilePathRef, isSafeUrl } from "./markdown-link.ts";
import { FoldOpen } from "../timeline/fold-open.ts";

/** `location.origin`, or `null` where there is no `location` (unit tests
 * render `renderMarkdownAst` outside a DOM). Kept as a tiny wrapper rather
 * than inlining the guard at each of `classifyMarkdownLinkUrl`'s three call
 * sites below. */
function currentOrigin(): string | null {
  return typeof location === "undefined" ? null : location.origin;
}

// `isSafeUrl` lives in markdown-link.ts (scheme policy and path policy are two
// answers to the same question); re-exported here so a caller reasoning about
// what this renderer will emit has one import.
export { isSafeUrl };
/** Synthetic node the `<details>` fold (see `foldDetailsBlocks`) inserts into
 * the mdast tree. Not an mdast type — `type` is namespaced so it can never
 * collide with a future CommonMark/GFM node, and `renderNode` is the only
 * place that knows how to render it. */
export interface MarkdownDetails {
  type: "ccmsgDetails";
  /** `<details open>`; any other attribute disqualifies the tag entirely. */
  open: boolean;
  /** Inline children of the `<summary>` line, already parsed as markdown.
   * Absent when the block had no recognizable `<summary>` line (the browser
   * then supplies its own default disclosure label). */
  summary?: PhrasingContent[];
  children: AnyNode[];
}

/** Heading depths that own a foldable section. `h1` is the document's title
 * rather than one of its sections, so it never folds — a document whose only
 * heading is its title has nothing to fold, which is the intended reading. */
type SectionDepth = 2 | 3 | 4 | 5 | 6;

/** Synthetic node `foldMarkdownSections` inserts into the tree: a heading plus
 * everything under it, so the renderer has a single element to hide when the
 * section is collapsed. Namespaced `type` for the same reason
 * `MarkdownDetails` is — it can never collide with a future mdast node. */
export interface MarkdownSection {
  type: "ccmsgSection";
  depth: SectionDepth;
  /** Position among sibling sections, dot-joined with the ancestors' ("2",
   * "2.1", "2.1.3"). Structural rather than derived from the heading text, so
   * two sections with the same title still fold independently, and stable for
   * as long as the source is — which is exactly how long the open/closed state
   * keyed on it lives (a new source builds a new store). */
  key: string;
  heading: Heading;
  children: AnyNode[];
}

type AnyNode = RootContent | PhrasingContent | MarkdownDetails | MarkdownSection;

export interface MarkdownHeading {
  depth: Heading["depth"];
  id: string;
  number: string;
  text: string;
}

function headingPlainText(node: PhrasingContent): string {
  switch (node.type) {
    case "text":
    case "inlineCode":
    case "html":
      return node.value;
    case "image":
      return node.alt ?? "";
    case "break":
      return " ";
    default: {
      const parent = node as PhrasingContent & { children?: PhrasingContent[] };
      return parent.children?.map(headingPlainText).join("") ?? "";
    }
  }
}

/** Extract the numbered document outline used by both heading anchors and the
 * file preview's TOC. The counter transition mirrors app.css exactly: entering
 * depth N increments that level and resets every deeper level. */
export function extractMarkdownHeadings(root: Root): MarkdownHeading[] {
  const counters = [0, 0, 0, 0, 0, 0];
  const headings: MarkdownHeading[] = [];

  function visit(nodes: AnyNode[] | undefined): void {
    if (!nodes) return;
    for (const node of nodes) {
      if (node.type === "heading") {
        const heading = node as Heading;
        const index = heading.depth - 1;
        counters[index] += 1;
        counters.fill(0, index + 1);
        const number = counters.slice(0, heading.depth).join(".");
        headings.push({
          depth: heading.depth,
          id: `md-section-${number.replaceAll(".", "-")}`,
          number,
          text:
            heading.children.map(headingPlainText).join("").replace(/\s+/g, " ").trim() ||
            "（無題）",
        });
        continue;
      }
      const parent = node as AnyNode & { children?: AnyNode[] };
      visit(parent.children);
    }
  }

  visit(root.children);
  return headings;
}

/** Checked state of every GFM task item in the tree, in the order the render
 * walk visits them (= the order that assigns ordinals). Paired with
 * `scanTaskStates` by `taskStatesAlign` to decide whether ordinals are a
 * trustworthy coordinate for writing back to the source. */
export function extractTaskStates(root: Root): boolean[] {
  const states: boolean[] = [];
  function visit(nodes: AnyNode[] | undefined): void {
    if (!nodes) return;
    for (const node of nodes) {
      if (node.type === "listItem" && typeof (node as ListItem).checked === "boolean") {
        states.push((node as ListItem).checked as boolean);
      }
      const parent = node as AnyNode & { children?: AnyNode[] };
      visit(parent.children);
    }
  }
  visit(root.children);
  return states;
}

/** Where a path-shaped link goes, once something in this build can open one.
 *
 * `href` is a real URL so the browser's own affordances (middle click, open in
 * a new tab, the status bar) keep working; `onClick` is how the app takes the
 * plain click back, since routing here is `history.pushState` and a full
 * navigation would reload the page. */
export interface MarkdownPathLink {
  readonly href: string;
  readonly onClick?: (event: MouseEvent) => void;
}

/** Answers where one file reference opens, or nothing when it opens nowhere —
 * which is every caller that shows no files, and any reference that cannot be
 * resolved against the session that wrote it. */
export type MarkdownPathLinker = (ref: FilePathRef) => MarkdownPathLink | undefined;

interface MarkdownRenderCtx {
  headings?: readonly MarkdownHeading[];
  headingIndex: number;
  pathLinker?: MarkdownPathLinker;
  /** Interactive GFM task lists. When set, every task item renders as a real
   * `<input type="checkbox">` whose click reports the item's document-order
   * ordinal back to the caller, which owns the file write. Absent (every
   * viewer that isn't showing a writable file) the items render exactly as
   * they always have. */
  taskList?: MarkdownTaskListCtx;
  /** Running count of task items visited so far — the ordinal assigned to the
   * next one. Mutated during the walk, mirroring `headingIndex`. */
  taskIndex: number;
  /** 探している言葉。地の文の中の一致だけを `<mark>` で囲む。コードは囲まない
   * — 色付けは 1 行を span の列に切ってあり、その境界をまたぐ `<mark>` は
   * 作れない (ファイル本文の側は `splitSpansForHighlight` が span を切り直す
   * ことで同じことをしている)。 */
  highlight?: readonly SearchWord[];
}

/** A failed write, reported against the item it happened to.
 *
 * `seq` increments on every fresh occurrence, including a repeat failure of an
 * item that is already showing this same message. It is the element key of the
 * rendered message, so a repeat remounts it and its one-shot flash animation
 * plays again — otherwise a second click on an already-errored item would
 * change nothing on screen and read as "the click did nothing". */
export interface MarkdownTaskError {
  message: string;
  seq: number;
}

/** Wiring for interactive task lists (see `MarkdownRenderCtx.taskList`). */
export interface MarkdownTaskListCtx {
  /** Invoked with the clicked item's document-order ordinal, the state it was
   * displaying, and the state the click asks for. The caller applies the
   * click to the rendered source immediately and writes behind it, so the
   * checkboxes stay live rather than disabling during a write. */
  onToggle: (ordinal: number, from: boolean, to: boolean) => void;
  /** Failures to show *at* the items they belong to, keyed by the ordinal the
   * item occupies now. A write that fails only becomes visible when the user
   * is looking at the checkbox that just sprang back, and that checkbox is
   * wherever the user last clicked — not the top of a document they have
   * scrolled away from. Several items can fail independently (writes are
   * queued, each resolved against its own fresh read), so this is a map rather
   * than one message. */
  errors?: ReadonlyMap<number, MarkdownTaskError>;
  /** Dismiss the message on one item. Absent = no dismiss affordance. */
  onDismissError?: (ordinal: number) => void;
}

/** The open/closed state of one document's sections, plus the key list the
 * document-wide menu items act on. `null` (the default) is how every caller
 * that did not ask for folding gets the flat rendering it always had — the
 * shell then draws nothing but its children. */
interface MarkdownSectionFold {
  store: FoldOpen;
  /** Every section key in the document, in order. */
  allKeys: readonly string[];
}
const MarkdownSectionFoldContext = createContext<MarkdownSectionFold | null>(null);

/** Hover-intent delays for the caret's menu. Opening is slow enough that a
 * pointer crossing the caret on its way to the text never summons the menu;
 * closing is slower still, because the gap the pointer travels to reach the
 * menu is a `mouseleave` on the caret. */
const SECTION_MENU_OPEN_MS = 200;
const SECTION_MENU_CLOSE_MS = 250;

/** One section's frame: the caret + its menu, the heading, and the collapsible
 * body behind the guide line.
 *
 * The heading and the body arrive **already rendered**. The mdast walk assigns
 * heading anchors by a counter it mutates as it goes (`ctx.headingIndex`), so
 * it has to stay one synchronous document-order pass; deferring any part of it
 * into a component that re-renders on its own (which is exactly what a fold
 * toggle does) would renumber anchors on every click. This component therefore
 * owns only the state, never the walk.
 *
 * A closed body stays mounted and is hidden in CSS rather than unmounted: an
 * anchor jump into a collapsed section has to find its target element before
 * anything can open the sections around it. */
function MarkdownSectionShell({
  sectionKey,
  depth,
  descendantKeys,
  heading,
  body,
}: {
  sectionKey: string;
  /** The heading's level. Carried into the class name because the numbering
   * counters have to be reset per level from the section element (app.css:
   * a heading's own `counter-reset` no longer reaches the headings below it
   * once they sit in a sibling subtree rather than after it). */
  depth: SectionDepth;
  descendantKeys: readonly string[];
  heading: VNode | string;
  body: (VNode | string)[];
}) {
  const fold = useContext(MarkdownSectionFoldContext);
  const store = fold?.store;
  // Reading the store during render is what subscribes this section to its own
  // key and nothing else — the reason the state lives out there at all.
  const open = store ? store.isOpen(sectionKey, true) : true;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelMenuTimer = useCallback(() => {
    if (menuTimer.current === null) return;
    clearTimeout(menuTimer.current);
    menuTimer.current = null;
  }, []);
  const scheduleMenu = useCallback(
    (next: boolean, delay: number) => {
      cancelMenuTimer();
      menuTimer.current = setTimeout(() => {
        menuTimer.current = null;
        setMenuOpen(next);
      }, delay);
    },
    [cancelMenuTimer],
  );
  useEffect(() => cancelMenuTimer, [cancelMenuTimer]);

  const applyTo = useCallback(
    (keys: readonly string[], next: boolean) => {
      if (!store) return;
      for (const key of keys) store.set(key, next);
      cancelMenuTimer();
      setMenuOpen(false);
    },
    [store, cancelMenuTimer],
  );

  // "…children" opens this section too: opening the subtree of a collapsed
  // section would otherwise reveal nothing. Closing the subtree deliberately
  // leaves this section open — "close the children" and "close this" are two
  // different requests, and the caret alone already does the second.
  const openSelfAndChildren = [sectionKey, ...descendantKeys];

  return (
    <section
      class={`md-sec md-sec-d${depth}${open ? "" : " md-sec-closed"}`}
      data-md-section={sectionKey}
      data-open={open ? "true" : "false"}
    >
      <div class="md-sec-head">
        <span
          class="md-sec-caret-wrap"
          onMouseEnter={() => scheduleMenu(true, SECTION_MENU_OPEN_MS)}
          onMouseLeave={() => scheduleMenu(false, SECTION_MENU_CLOSE_MS)}
        >
          <button
            type="button"
            class="md-sec-caret"
            aria-expanded={open}
            aria-label={open ? "セクションを閉じる" : "セクションを開く"}
            title={open ? "セクションを閉じる" : "セクションを開く"}
            onClick={() => store?.set(sectionKey, !open)}
            onFocus={() => {
              cancelMenuTimer();
              setMenuOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setMenuOpen(false);
            }}
          />
          {menuOpen ? (
            <div
              class="md-sec-menu"
              role="menu"
              onMouseEnter={cancelMenuTimer}
              onMouseLeave={() => scheduleMenu(false, SECTION_MENU_CLOSE_MS)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setMenuOpen(false);
              }}
            >
              <button
                type="button"
                role="menuitem"
                title="この文書の全セクションを開く"
                onClick={() => applyTo(fold?.allKeys ?? [], true)}
              >
                Open all
              </button>
              <button
                type="button"
                role="menuitem"
                title="このセクションとその配下だけを開く"
                onClick={() => applyTo(openSelfAndChildren, true)}
              >
                Open all children
              </button>
              <button
                type="button"
                role="menuitem"
                title="この文書の全セクションを閉じる"
                onClick={() => applyTo(fold?.allKeys ?? [], false)}
              >
                Close all
              </button>
              <button
                type="button"
                role="menuitem"
                title="このセクションの配下だけを閉じる"
                onClick={() => applyTo(descendantKeys, false)}
              >
                Close all children
              </button>
            </div>
          ) : null}
        </span>
        {heading}
      </div>
      <div class="md-sec-body">
        {/* Mirrors the Timeline's fold guide (`.tl-fold-guide`): the line down
         * the left of an expanded section is also the control that closes it,
         * so a reader who has scrolled past the heading does not have to
         * scroll back up to the caret. */}
        <button
          type="button"
          class="md-sec-guide"
          aria-label="セクションを閉じる"
          title="セクションを閉じる"
          onClick={() => store?.set(sectionKey, false)}
        />
        <div class="md-sec-content">{body}</div>
      </div>
    </section>
  );
}

/** Open every section between the document root and `id`, then bring it into
 * view. Called for outline links: the target may be inside sections that are
 * collapsed, and scrolling to a hidden element does nothing.
 *
 * Ancestors are read off the DOM rather than the tree because the anchor id is
 * all the caller has — the outline entry knows the heading it points at, not
 * which sections enclose it. The bodies are already mounted (see
 * `MarkdownSectionShell`), so the element is findable even while hidden; only
 * the scroll waits for the frame that reveals it. */
function revealMarkdownAnchor(id: string, store: FoldOpen | null): void {
  const target = document.getElementById(id);
  if (!target) return;
  if (!store) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  for (
    let el: Element | null = target.closest("[data-md-section]");
    el;
    el = el.parentElement?.closest("[data-md-section]") ?? null
  ) {
    const key = el.getAttribute("data-md-section");
    if (key) store.set(key, true);
  }
  requestAnimationFrame(() => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function renderChildren(
  nodes: AnyNode[] | undefined,
  keyPrefix: string,
  ctx: MarkdownRenderCtx,
): (VNode | string)[] {
  if (!nodes) return [];
  return nodes.map((n, i) => renderNode(n, `${keyPrefix}.${i}`, ctx));
}

// Every mdast node type this renderer has an opinion on is listed in
// DR-0010's required-coverage set (heading/paragraph/list/listItem/code/
// inlineCode/blockquote/table family/link/image/strong/emphasis/del/break/
// thematicBreak/html/text). Anything else — a future CommonMark/GFM addition,
// or an mdast extension this app never opted into (e.g. wikiLink, which needs
// its own micromark/mdast extension pair this app never registers) — falls
// through to the `default` case below,
// which recurses into `children` if present so text content isn't silently
// dropped, or renders nothing if the node has none.
/** 地の文の中の一致を `<mark>` で囲む。探していない時と一致が無い時は元の文を
 * そのまま返すので、囲むための要素が増えることはない。 */
function marked(
  text: string,
  key: string,
  words: readonly SearchWord[] | undefined,
): VNode | string {
  if (words === undefined || words.length === 0) return text;
  const pieces = splitForHighlight(text, words);
  if (pieces.length === 1 && pieces[0]!.color === undefined) return text;
  return (
    <span key={key}>
      {pieces.map((piece, at) =>
        piece.color === undefined ? (
          piece.text
        ) : (
          <mark key={at} class="search-hl" data-search-color={piece.color}>
            {piece.text}
          </mark>
        ),
      )}
    </span>
  );
}

function renderNode(node: AnyNode, key: string, ctx: MarkdownRenderCtx): VNode | string {
  switch (node.type) {
    case "text":
      return marked((node as Text).value, key, ctx.highlight);

    case "paragraph":
      return <p key={key}>{renderChildren((node as Paragraph).children, key, ctx)}</p>;

    case "heading": {
      const heading = node as Heading;
      const tag = `h${Math.min(6, Math.max(1, heading.depth))}` as
        | "h1"
        | "h2"
        | "h3"
        | "h4"
        | "h5"
        | "h6";
      const outlineHeading = ctx.headings?.[ctx.headingIndex];
      ctx.headingIndex += 1;
      return h(
        tag,
        { key, id: outlineHeading?.id },
        renderChildren(heading.children, key, ctx),
      ) as VNode;
    }

    case "strong":
      return <strong key={key}>{renderChildren((node as Strong).children, key, ctx)}</strong>;

    case "emphasis":
      return <em key={key}>{renderChildren((node as Emphasis).children, key, ctx)}</em>;

    case "delete":
      return <del key={key}>{renderChildren((node as Delete).children, key, ctx)}</del>;

    case "inlineCode":
      return (
        <code class="md-inline-code" key={key}>
          {(node as InlineCode).value}
        </code>
      );

    case "code": {
      const code = node as Code;
      return <CodeBlock key={key} code={code.value} lang={code.lang ?? null} />;
    }

    case "link": {
      const link = node as Link;
      const target = classifyMarkdownLinkUrl(link.url, currentOrigin());
      const label = renderChildren(link.children, key, ctx);
      if (target.kind === "disarm") {
        // Render the link's own text with no <a>/href at all, so a hostile URL
        // scheme never reaches the DOM, while the human-visible content is
        // still shown rather than dropped.
        return <span key={key}>{label}</span>;
      }
      if (target.kind === "path") {
        // A repo-relative or absolute path the author meant as a file. It opens
        // where the caller says files open; a caller that shows none, or a
        // reference that resolves against nothing, leaves it as its own text
        // with the target as the tooltip — a path-shaped `href` on this origin
        // would navigate away from the app with no way back.
        const to = ctx.pathLinker?.(target.ref);
        if (to === undefined) {
          return (
            <span key={key} title={link.url}>
              {label}
            </span>
          );
        }
        return (
          <a key={key} class="md-path-link" href={to.href} title={link.url} onClick={to.onClick}>
            {label}
          </a>
        );
      }
      if (target.kind === "anchor" || target.kind === "internal") {
        // `internal`: an absolute URL that resolves back to this page's own
        // origin — e.g. a session link pasted from the address bar. It names a
        // place inside this same app, so it opens in the same tab.
        return (
          <a key={key} href={target.url} title={link.title ?? undefined}>
            {label}
          </a>
        );
      }
      return (
        <a
          key={key}
          href={target.url}
          title={link.title ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
        >
          {label}
        </a>
      );
    }

    case "image": {
      // Design rationale: never auto-fetch the image URL (no <img src=...>).
      // A remote image load is an information-leak vector outside this app's
      // control (viewer IP/UA reaches an arbitrary third party the moment the
      // markdown renders, no click required) — shown instead as alt text plus a
      // link the user opts into.
      const image = node as Image;
      const label = image.alt || image.url;
      const target = classifyMarkdownLinkUrl(image.url, currentOrigin());
      if (target.kind === "path") {
        // An image whose source is a repository file. It is not fetched — the
        // rationale above stands whatever the path is — but it does name a file
        // this build can show, so it opens there like any other path link.
        const to = ctx.pathLinker?.(target.ref);
        return to === undefined ? (
          <span key={key} title={image.url}>
            🖼 {label}
          </span>
        ) : (
          <a key={key} class="md-image-link" href={to.href} title={image.url} onClick={to.onClick}>
            🖼 {label}
          </a>
        );
      }
      if (target.kind === "disarm") {
        return (
          <span key={key} title={image.url}>
            🖼 {label}
          </span>
        );
      }
      if (target.kind === "anchor" || target.kind === "internal") {
        return (
          <a key={key} class="md-image-link" href={target.url}>
            🖼 {label}
          </a>
        );
      }
      return (
        <a
          key={key}
          class="md-image-link"
          href={target.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          🖼 {label}
        </a>
      );
    }

    case "list": {
      const list = node as List;
      const tag = list.ordered ? "ol" : "ul";
      return h(
        tag,
        { key, start: list.start ?? undefined },
        renderChildren(list.children, key, ctx),
      ) as VNode;
    }

    case "listItem": {
      const item = node as ListItem;
      // `checked` is non-null exactly for GFM task items (confirmed against
      // the real parser). Every task item consumes an ordinal whether or not
      // interaction is enabled, so the numbering the click reports is the
      // same numbering `findTaskLines` reconstructs from the source. The
      // ordinal is taken *before* recursing so a parent item numbers ahead of
      // the nested items inside it, matching document order.
      if (typeof item.checked !== "boolean") {
        return <li key={key}>{renderChildren(item.children, key, ctx)}</li>;
      }
      const checked = item.checked;
      const ordinal = ctx.taskIndex;
      ctx.taskIndex += 1;
      const children = renderChildren(item.children, key, ctx);
      const taskList = ctx.taskList;
      const error = taskList?.errors?.get(ordinal);
      const onDismissError = taskList?.onDismissError;
      return (
        <li
          // `seq` is part of the key so a *repeat* failure remounts the row and
          // replays its one-shot flash. Without it the class is already set,
          // the animation never restarts, and a second failing click looks
          // like nothing happened.
          key={error ? `${key}!${error.seq}` : key}
          class={
            "md-task-item" +
            (checked ? " md-task-checked" : "") +
            (error ? " md-task-item-error" : "")
          }
        >
          <input
            type="checkbox"
            class="md-task-checkbox"
            checked={checked}
            // Read-only contexts (message bodies, and any preview whose
            // source can't be written back) keep the checkbox as a visual
            // marker only — the parser eats the `[ ]` characters, so
            // rendering nothing would silently drop them from the display.
            disabled={!taskList}
            onClick={taskList ? () => taskList.onToggle(ordinal, checked, !checked) : undefined}
          />
          <span class="md-task-body">
            {children}
            {error ? (
              <span class="md-task-error" role="alert">
                <span class="md-task-error-text">{error.message}</span>
                {onDismissError ? (
                  <button
                    type="button"
                    class="md-task-error-dismiss"
                    aria-label="このエラーを閉じる"
                    onClick={() => onDismissError(ordinal)}
                  >
                    {"×"}
                  </button>
                ) : null}
              </span>
            ) : null}
          </span>
        </li>
      );
    }

    case "blockquote":
      return (
        <blockquote key={key}>{renderChildren((node as Blockquote).children, key, ctx)}</blockquote>
      );

    case "thematicBreak":
      return <hr key={key} />;

    case "break":
      return <br key={key} />;

    case "ccmsgDetails": {
      // The sole structural HTML mapping (kawaz r55 m77, see foldDetailsBlocks).
      // Only `open` crosses from source into the DOM, and only as a boolean —
      // the tag's own text never becomes markup, so this stays inside the
      // "no raw HTML" guarantee the module doc comment describes.
      const details = node as MarkdownDetails;
      return (
        <details key={key} class="md-details" open={details.open}>
          {details.summary && details.summary.length > 0 ? (
            <summary>{renderChildren(details.summary, `${key}.s`, ctx)}</summary>
          ) : (
            <summary>Details</summary>
          )}
          {renderChildren(details.children, key, ctx)}
        </details>
      );
    }

    case "ccmsgSection": {
      const section = node as MarkdownSection;
      // Heading first, then body: `renderNode` is a single document-order
      // pass and `ctx.headingIndex` counts on it staying that way.
      const heading = renderNode(section.heading, `${key}.h`, ctx);
      const body = renderChildren(section.children, key, ctx);
      return (
        <MarkdownSectionShell
          key={key}
          sectionKey={section.key}
          depth={section.depth}
          descendantKeys={collectMarkdownSectionKeys(section.children)}
          heading={heading}
          body={body}
        />
      );
    }

    case "html":
      // Never executed: the raw source text of an HTML block/inline node is
      // shown as a plain JSX text child (Preact-escaped), not parsed or
      // injected via innerHTML — see module doc comment.
      return (
        <span class="md-raw-html" key={key}>
          {(node as Html).value}
        </span>
      );

    case "table": {
      const table = node as Table;
      const align = table.align ?? [];
      return (
        // Wrapper scrolls horizontally so a wide table (many columns) doesn't
        // get squeezed into the container's width and wrap every cell onto
        // several lines — the table itself keeps its natural (unwrapped)
        // width via `.md table { width: max-content }` in app.css, and this
        // div is what actually clips/scrolls. See app.css's `.md-table-scroll`
        // doc comment for why the scroll container has to be a separate
        // element rather than `overflow-x` on the table itself.
        <div class="md-table-scroll" key={key}>
          <table>
            <tbody>
              {table.children.map((row, ri) => (
                <tr key={`${key}.${ri}`}>
                  {row.children.map((cell, ci) => {
                    const cellTag = ri === 0 ? "th" : "td";
                    const cellAlign = align[ci];
                    return h(
                      cellTag,
                      {
                        key: `${key}.${ri}.${ci}`,
                        style: cellAlign ? { textAlign: cellAlign } : undefined,
                      },
                      renderChildren(cell.children, `${key}.${ri}.${ci}`, ctx),
                    ) as VNode;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    default: {
      // Safe fallback for both "known-but-unhandled" and "never-seen-before"
      // node shapes: recurse into `children` (duck-typed — see module doc
      // comment) so text content still surfaces, otherwise render nothing.
      const maybeParent = node as unknown as { children?: unknown };
      if (Array.isArray(maybeParent.children)) {
        return <span key={key}>{renderChildren(maybeParent.children as AnyNode[], key, ctx)}</span>;
      }
      return "";
    }
  }
}

function unusedPrivateUseMarker(source: string): string {
  const used = new Set(source);
  const ranges: readonly [number, number][] = [
    [0xe000, 0xf8ff],
    [0xf0000, 0xffffd],
    [0x100000, 0x10fffd],
  ];
  for (const [start, end] of ranges) {
    for (let codePoint = start; codePoint <= end; codePoint += 1) {
      const candidate = String.fromCodePoint(codePoint);
      if (!used.has(candidate)) return candidate;
    }
  }
  let fallback = "\uE000\uE000";
  while (source.includes(fallback)) fallback += "\uE000";
  return fallback;
}

// Every `<…>` that is NOT a valid CommonMark autolink is stashed behind
// private-use markers and restored as plain text after parsing. Autolinks —
// `<scheme:rest>` (scheme = letter + [A-Za-z0-9+.-]{1,31}) and `<user@host>` —
// stay available to the parser.
//
// Design rationale: this keeps the renderer's "no raw HTML" policy (DR-0010) a
// property of the *source* rather than of node handling, which matters because
// CommonMark's HTML-block rule is greedy: a line starting with a tag-shaped
// token swallows every following line until a blank one into a single `html`
// node, so `<確認項目> の **意味**` would lose its emphasis and render as raw
// text (kawaz r55m83 is the same class of surprise, seen through a different
// parser). Protecting pre-parse also lets the `<details>` fold below match on
// `text` nodes, where inline and fenced code are already claimed by their own
// node kinds.
function protectTagLikeAngleBrackets(source: string): {
  source: string;
  openMarker?: string;
  closeMarker?: string;
} {
  const AUTOLINK_URI = /^[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*$/;
  // CommonMark's email autolink production, trimmed to what it actually needs.
  const AUTOLINK_EMAIL =
    /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
  const tagLike = /<([^<>\n]*)>/g;
  const isAutolink = (content: string): boolean =>
    AUTOLINK_URI.test(content) || AUTOLINK_EMAIL.test(content);
  if (!tagLike.test(source)) return { source };
  tagLike.lastIndex = 0;
  const openMarker = unusedPrivateUseMarker(source);
  const closeMarker = unusedPrivateUseMarker(source + openMarker);
  return {
    source: source.replace(tagLike, (match, content: string) => {
      if (isAutolink(content)) return match;
      return `${openMarker}${content}${closeMarker}`;
    }),
    openMarker,
    closeMarker,
  };
}

/** Undo one `protect*` substitution everywhere in the tree: every string field
 * of every node, so protected text inside `code.value` is restored too. */
function restoreProtectedText(value: unknown, marker: string, replacement: string): void {
  if (Array.isArray(value)) {
    for (const item of value) restoreProtectedText(item, marker, replacement);
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string") {
      if (child.includes(marker)) {
        (value as Record<string, unknown>)[key] = child.replaceAll(marker, replacement);
      }
    } else {
      restoreProtectedText(child, marker, replacement);
    }
  }
}

// ---------------------------------------------------------------------------
// `<details>` folding (kawaz r55 m77)
//
// The one HTML construct this renderer understands structurally. Everything
// else stays literal text — see the module doc comment; enabling arbitrary
// HTML would reintroduce the injection surface DR-0010 closed. The tags below
// are recognized by *shape* and mapped onto Preact's own `<details>`/
// `<summary>` elements, so no attacker-controlled string ever becomes markup:
// the only thing a matched tag can influence is the boolean `open`.
//
// The matching runs on the mdast tree rather than the raw source because
// `protectTagLikeAngleBrackets` (above) rewrites every tag-shaped token before
// the parser sees it, so `<details>` never arrives as an mdast `html` node —
// it lands as literal `text`. Working post-parse also means fenced code and
// inline code are already claimed by their own nodes, so a `<details>` inside
// a ```html fence is a `code` node and can't be mistaken for a real tag.
//
// After parsing, a `<details>` block appears as text lines split across
// `paragraph` children: the opening tag and the `<summary>` line are separate
// `text` children of one paragraph (joined by a `"\n"` text node or a `break`
// when the line ended in two spaces), the body is whatever sibling nodes
// follow, and `</details>` is a paragraph of its own. The fold below
// reassembles that.

/** `<details>` / `<details open>` — nothing else. The name is anchored on both
 * sides so `<detailsfoo>` cannot match, and the only accepted attribute is a
 * bare `open`; anything else (`onclick=…`, `class=…`, `open="x"`) fails to
 * match and the tag stays literal text. */
const DETAILS_OPEN_TAG_RE = /^<details(\s+open)?\s*>$/i;
const DETAILS_CLOSE_TAG_RE = /^<\/details\s*>$/i;
const SUMMARY_OPEN_RE = /^<summary\s*>([\s\S]*)$/i;
const SUMMARY_CLOSE_RE = /^([\s\S]*)<\/summary\s*>$/i;

/** One source line's worth of inline nodes, tagged with the paragraph it came
 * from so the rebuild can tell "two lines of one paragraph" from "two
 * paragraphs". `block` items are every other node kind, passed through whole. */
type FoldItem =
  | { kind: "line"; line: PhrasingContent[]; group: number }
  | { kind: "block"; node: AnyNode };

/** Flatten a sibling list into the line stream the fold scans. Paragraphs
 * explode into their source lines — mdast encodes a soft break inside a
 * paragraph as a `"\n"` text child and a hard break as a `break` node — so a
 * `<details>` block written without blank lines (which the parser keeps as a
 * *single* paragraph) is matched by exactly the same code path as the
 * blank-line-separated form. */
function toFoldItems(nodes: AnyNode[]): FoldItem[] {
  const items: FoldItem[] = [];
  nodes.forEach((node, group) => {
    if (node.type !== "paragraph") {
      items.push({ kind: "block", node });
      return;
    }
    let line: PhrasingContent[] = [];
    const endLine = () => {
      items.push({ kind: "line", line, group });
      line = [];
    };
    for (const child of node.children) {
      if (child.type === "break") {
        endLine();
        continue;
      }
      if (child.type === "text" && child.value.includes("\n")) {
        const parts = child.value.split("\n");
        parts.forEach((part, i) => {
          if (i > 0) endLine();
          if (part !== "") line.push({ type: "text", value: part });
        });
        continue;
      }
      line.push(child);
    }
    endLine();
  });
  return items;
}

/** Turn a run of line items back into paragraphs, one per source paragraph
 * (`group`), restoring the `"\n"` separators `toFoldItems` consumed. Blocks
 * pass through untouched, and all-whitespace remnants are dropped rather than
 * emitted as empty paragraphs. */
function fromFoldItems(items: FoldItem[]): AnyNode[] {
  const out: AnyNode[] = [];
  let pending: PhrasingContent[][] = [];
  let pendingGroup = -1;
  const flush = () => {
    if (pending.length === 0) return;
    const children: PhrasingContent[] = [];
    pending.forEach((line, i) => {
      if (i > 0) children.push({ type: "text", value: "\n" });
      children.push(...line);
    });
    pending = [];
    if (children.some((c) => c.type !== "text" || c.value.trim() !== "")) {
      out.push({ type: "paragraph", children } satisfies Paragraph);
    }
  };
  for (const item of items) {
    if (item.kind === "block") {
      flush();
      out.push(item.node);
      continue;
    }
    if (item.group !== pendingGroup) {
      flush();
      pendingGroup = item.group;
    }
    pending.push(item.line);
  }
  flush();
  return out;
}

/** The line's text when it is pure text, else `null`. A tag line is by
 * definition pure text, so a line holding emphasis or a link is not one. */
function lineAsPlainText(line: PhrasingContent[]): string | null {
  let out = "";
  for (const node of line) {
    if (node.type !== "text") return null;
    out += node.value;
  }
  return out.trim();
}

/** `<summary>…</summary>` occupying a whole line, returning the label's inline
 * nodes. Matching on the parsed children (rather than re-parsing a flattened
 * string) is what lets `<summary>**bold** t</summary>` keep its `strong` node:
 * the parser already turned the label into inline markdown, and only the
 * literal tag text at the two ends needs stripping. */
function matchSummaryLine(line: PhrasingContent[]): PhrasingContent[] | null {
  const first = line[0];
  const last = line[line.length - 1];
  if (!first || !last || first.type !== "text" || last.type !== "text") return null;
  if (line.length === 1) {
    const m = /^<summary\s*>([\s\S]*)<\/summary\s*>$/i.exec(first.value.trim());
    if (!m) return null;
    const inner = m[1]!.trim();
    return inner === "" ? [] : [{ type: "text", value: inner }];
  }
  const openMatch = SUMMARY_OPEN_RE.exec(first.value.trimStart());
  const closeMatch = SUMMARY_CLOSE_RE.exec(last.value.trimEnd());
  if (!openMatch || !closeMatch) return null;
  const head = openMatch[1]!;
  const tail = closeMatch[1]!;
  const middle = line.slice(1, -1);
  const label: PhrasingContent[] = [];
  if (head !== "") label.push({ type: "text", value: head });
  label.push(...middle);
  if (tail !== "") label.push({ type: "text", value: tail });
  return label;
}

/** Collapse balanced `<details>`…`</details>` runs into `ccmsgDetails` nodes,
 * recursing into the folded body and into every other container so a block
 * inside a blockquote or list item folds the same way.
 *
 * An opener with no matching closer is left exactly as parsed (literal tag
 * text) — a half-written block should look unfinished rather than silently
 * swallow the rest of the document. Nesting is handled by depth counting: the
 * closer that ends a block is the one bringing depth back to zero.
 *
 * Termination: the outer scan advances past the closer it consumed each time,
 * and the recursive call receives the strictly shorter body slice (both tag
 * lines excluded), so depth is bounded by the input length. */
function foldDetailsBlocks(nodes: AnyNode[]): AnyNode[] {
  const items = toFoldItems(nodes);
  const out: FoldItem[] = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i]!;
    const tag = item.kind === "line" ? lineAsPlainText(item.line) : null;
    const openMatch = tag === null ? null : DETAILS_OPEN_TAG_RE.exec(tag);
    if (!openMatch) {
      out.push(
        item.kind === "block" ? { kind: "block", node: foldInsideContainer(item.node) } : item,
      );
      i += 1;
      continue;
    }
    let depth = 1;
    let closeAt = -1;
    for (let j = i + 1; j < items.length; j += 1) {
      const candidate = items[j]!;
      if (candidate.kind !== "line") continue;
      const text = lineAsPlainText(candidate.line);
      if (text === null) continue;
      if (DETAILS_CLOSE_TAG_RE.test(text)) {
        depth -= 1;
        if (depth === 0) {
          closeAt = j;
          break;
        }
        continue;
      }
      if (DETAILS_OPEN_TAG_RE.test(text)) depth += 1;
    }
    if (closeAt < 0) {
      out.push(item);
      i += 1;
      continue;
    }
    // A `<summary>` counts only as the block's very first line.
    const next = items[i + 1];
    const summary = next && next.kind === "line" ? matchSummaryLine(next.line) : null;
    const bodyStart = summary ? i + 2 : i + 1;
    out.push({
      kind: "block",
      node: {
        type: "ccmsgDetails",
        open: openMatch[1] !== undefined,
        ...(summary ? { summary } : {}),
        children: foldDetailsBlocks(fromFoldItems(items.slice(bodyStart, closeAt))),
      },
    });
    i = closeAt + 1;
  }
  return fromFoldItems(out);
}

/** Recurse the fold into a non-`<details>` container's children (blockquote,
 * list, listItem, …) without disturbing leaf nodes. */
function foldInsideContainer(node: AnyNode): AnyNode {
  if (node.type === "heading" || node.type === "code") return node;
  const parent = node as AnyNode & { children?: AnyNode[] };
  if (!Array.isArray(parent.children)) return node;
  return { ...node, children: foldDetailsBlocks(parent.children) } as AnyNode;
}

/** Group a flat block sequence into nested sections (kawaz r151 m41).
 *
 * mdast is flat: `## A`, its paragraphs, and `### A.1` are siblings, which is
 * fine to *render* but leaves nothing to collapse — "close section A" has no
 * element that means "A and everything under it". This walk rebuilds the
 * implied outline: each heading of depth >= 2 opens a section that swallows
 * the following blocks until a heading of the same or shallower depth, and a
 * `#` (document title) closes everything and stays a plain heading.
 *
 * Depth skips (`##` -> `####`) nest by relative depth rather than by absolute
 * level — the `####` becomes a child of the `##` because that is what the
 * author's indentation says, even though a `###` level is missing. Only the
 * top level of the block sequence is grouped: a heading inside a blockquote,
 * a list item, or a `<details>` fold keeps rendering exactly as it did, since
 * folding it would mean hiding part of a container that owns its own layout.
 *
 * Pure and total — every input node reaches the output exactly once, so a
 * document with no headings at all round-trips unchanged. */
export function foldMarkdownSections(nodes: AnyNode[]): AnyNode[] {
  const out: AnyNode[] = [];
  const stack: { section: MarkdownSection; childCount: number }[] = [];
  let rootCount = 0;

  for (const node of nodes) {
    const depth = node.type === "heading" ? (node as Heading).depth : 0;

    if (depth === 1) {
      stack.length = 0;
      out.push(node);
      continue;
    }

    if (depth >= 2) {
      while (stack.length > 0 && stack[stack.length - 1]!.section.depth >= depth) stack.pop();
      const parent = stack[stack.length - 1];
      const ordinal = parent ? (parent.childCount += 1) : (rootCount += 1);
      const section: MarkdownSection = {
        type: "ccmsgSection",
        depth: depth as SectionDepth,
        key: parent ? `${parent.section.key}.${ordinal}` : String(ordinal),
        heading: node as Heading,
        children: [],
      };
      (parent ? parent.section.children : out).push(section);
      stack.push({ section, childCount: 0 });
      continue;
    }

    (stack.length > 0 ? stack[stack.length - 1]!.section.children : out).push(node);
  }

  return out;
}

/** Every section key in a folded tree, in document order. The menu's
 * document-wide "Open all"/"Close all" need the whole list, and a section's
 * own "…children" items need its subtree's — the same walk answers both. */
export function collectMarkdownSectionKeys(
  nodes: readonly AnyNode[],
  acc: string[] = [],
): string[] {
  for (const node of nodes) {
    if (node.type !== "ccmsgSection") continue;
    const section = node as MarkdownSection;
    acc.push(section.key);
    collectMarkdownSectionKeys(section.children, acc);
  }
  return acc;
}

/** Parse the markdown source used by MarkdownView. Kept as a pure seam so
 * parser-level compatibility fixes are exercised without a DOM. */
export function parseMarkdownSource(source: string): Root {
  const protectedAngles = protectTagLikeAngleBrackets(source);
  const root = fromMarkdown(protectedAngles.source, {
    extensions: [gfmTable(), gfmStrikethrough(), gfmTaskListItem()],
    mdastExtensions: [
      gfmTableFromMarkdown(),
      gfmStrikethroughFromMarkdown(),
      gfmTaskListItemFromMarkdown(),
    ],
  });
  if (protectedAngles.openMarker) restoreProtectedText(root, protectedAngles.openMarker, "<");
  if (protectedAngles.closeMarker) restoreProtectedText(root, protectedAngles.closeMarker, ">");
  return root;
}

/** `parseMarkdownSource` plus the `<details>` fold. Separate from the parse
 * seam so the fold can be unit-tested against hand-built trees, and so the
 * `<summary>` re-parse above can call the unfolded parse without recursing
 * into itself. */
export function parseMarkdownDocument(source: string): Root {
  const root = parseMarkdownSource(source);
  return { ...root, children: foldDetailsBlocks(root.children) as RootContent[] };
}

/** Restricted-mode renderer for user-authored messages (kawaz r55 m12).
 *
 * When a human types a message into the composer, they almost never intend
 * `#foo` to be an H1 heading, `**word**` to be bold, or `<R G B>` to be an
 * HTML tag / autolink — the CommonMark syntax collides with everyday prose
 * and looks broken (heading swallowing the rest of the message, autolink
 * dropping the angle brackets and linkifying `R G B`). What users *do* use
 * on purpose is: inline code (`` `foo` ``), fenced code blocks (```` ``` ````),
 * and blockquote lines (`> ...`). This renderer keeps exactly those three
 * markdown constructs live and shows everything else verbatim as plain text.
 *
 * Deliberately tokenizes source directly (no `parse()` involvement) instead
 * of walking the mdast tree and flattening disallowed nodes back to text —
 * the mdast round trip loses positional details (`#NNNN` where the parser
 * ate the `#`, exact whitespace inside `_foo_` etc.), so reconstructing the
 * user's original characters from the tree is fragile. A three-token lexer
 * is small enough to test exhaustively and can't accidentally drop input.
 *
 * The output is wrapped in `<div class="md md-restricted">`; `.md-restricted`
 * applies `white-space: pre-wrap` so bare newlines in the user's message
 * render as line breaks (matching how the composer showed them). */
export function renderRestrictedMarkdown(
  source: string,
  pathLinker?: MarkdownPathLinker,
  highlight?: readonly SearchWord[],
): VNode {
  const lines = source.split("\n");
  const blocks: (VNode | string)[] = [];
  let key = 0;
  let i = 0;
  let pending: string[] = [];
  const flushText = () => {
    if (pending.length === 0) return;
    const text = pending.join("\n");
    pending = [];
    blocks.push(
      <span class="md-restricted-text" key={`b${key++}`}>
        {renderRestrictedInline(text, `b${key}`, pathLinker, highlight)}
      </span>,
    );
  };
  while (i < lines.length) {
    const line = lines[i]!;
    const fence = /^(`{3,})(\S*)\s*$/.exec(line);
    if (fence) {
      flushText();
      const marker = fence[1]!;
      const lang = fence[2] ? fence[2] : null;
      const body: string[] = [];
      i += 1;
      const closer = new RegExp(`^${marker}\\s*$`);
      while (i < lines.length && !closer.test(lines[i]!)) {
        body.push(lines[i]!);
        i += 1;
      }
      if (i < lines.length) i += 1; // consume closing fence
      blocks.push(<CodeBlock key={`b${key++}`} code={body.join("\n")} lang={lang} />);
      continue;
    }
    if (/^>\s?/.test(line)) {
      flushText();
      const quoted: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!)) {
        quoted.push(lines[i]!.replace(/^>\s?/, ""));
        i += 1;
      }
      const text = quoted.join("\n");
      blocks.push(
        <blockquote key={`b${key++}`}>
          <span class="md-restricted-text">
            {renderRestrictedInline(text, `b${key}`, pathLinker, highlight)}
          </span>
        </blockquote>,
      );
      continue;
    }
    pending.push(line);
    i += 1;
  }
  flushText();
  return <div class="md md-restricted">{blocks}</div>;
}

/** Inline pass for restricted rendering: only these two constructs are
 * markdown-styled — everything else is untouched text.
 *
 *   1. Inline code `` `foo` `` → `<code>`
 *   2. Inline link `[text](url)` → `<a>`, with the same URL scheme allowlist
 *      the full renderer applies: a hostile `javascript:` is disarmed to the
 *      link's own text with no `<a>`.
 *
 * Image markdown `![alt](url)` is NOT tokenized here, so a literal
 * `![alt](url)` a person typed stays verbatim as prose the same way heading and
 * list markers do.
 *
 * A backtick or `[` with no matching pair on the same string is left
 * verbatim (no swallowing). Scanning is left-to-right with `lastIndex`
 * tracked manually so each character is claimed by at most one token. */
function renderRestrictedInline(
  text: string,
  keyPrefix: string,
  pathLinker?: MarkdownPathLinker,
  highlight?: readonly SearchWord[],
): (VNode | string)[] {
  // Match either `code` OR [text](url). Alternation is left-to-right so a
  // literal `[foo](bar)` inside `code` stays inside the code span (the
  // backtick match wins first at that position).
  // The negative lookbehind `(?<!!)` guards image markdown `![alt](url)`: it
  // stays verbatim as prose, where a bare `[alt](url)` at the same position
  // would otherwise tokenize and swallow the trailing `alt`/`url` (see test).
  const re = /`([^`\n]+)`|(?<!!)\[([^\]\n]*)\]\(([^)\n\s]+)\)/g;
  const out: (VNode | string)[] = [];
  let last = 0;
  let n = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(marked(text.slice(last, m.index), `${keyPrefix}t${n}`, highlight));
    if (m[1] !== undefined) {
      out.push(
        <code class="md-inline-code" key={`${keyPrefix}c${n++}`}>
          {m[1]}
        </code>,
      );
    } else {
      const label = m[2] ?? "";
      const url = m[3] ?? "";
      out.push(renderRestrictedLink(label, url, `${keyPrefix}l${n++}`, pathLinker));
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(marked(text.slice(last), `${keyPrefix}t${n}`, highlight));
  return out.length > 0 ? out : [marked(text, `${keyPrefix}t0`, highlight)];
}

/** Render one `[label](url)` link under restricted mode. Mirrors the safe
 * subset of the full renderer's `link` case (the URL scheme allowlist), minus
 * the mdast child recursion — a restricted link's label is always the plain
 * text tokenized above. */
function renderRestrictedLink(
  label: string,
  url: string,
  key: string,
  pathLinker?: MarkdownPathLinker,
): VNode {
  const target = classifyMarkdownLinkUrl(url, currentOrigin());
  // A path a person typed opens where the caller says files open. With no such
  // caller it renders inert rather than navigating this origin.
  if (target.kind === "path") {
    const to = pathLinker?.(target.ref);
    return to === undefined ? (
      <span key={key}>{label || url}</span>
    ) : (
      <a key={key} class="md-path-link" href={to.href} title={url} onClick={to.onClick}>
        {label || url}
      </a>
    );
  }
  if (target.kind === "disarm") {
    // Drop the `<a>` entirely but keep the label visible so the reader isn't
    // silently robbed of the text. The URL itself is deliberately not shown
    // as a fallback the way a path target's is — a rejected scheme is exactly
    // the string we don't want to surface.
    return <span key={key}>{label}</span>;
  }
  if (target.kind === "anchor" || target.kind === "internal") {
    return (
      <a key={key} href={target.url}>
        {label || url}
      </a>
    );
  }
  return (
    <a key={key} href={target.url} target="_blank" rel="noopener noreferrer">
      {label || url}
    </a>
  );
}

/** Pure mdast-AST -> VNode transform, split out from `MarkdownView` so tests
 * can hand-construct mdast fragments (DR-0010) without going through
 * `parse()`. */
export function renderMarkdownAst(
  root: Root,
  headings?: readonly MarkdownHeading[],
  opts?: {
    taskList?: MarkdownTaskListCtx;
    pathLinker?: MarkdownPathLinker;
    /** Marks the root for the section-fold layout (the caret gutter). The tree
     * itself is folded by `foldMarkdownSections` before it gets here — this
     * only tells CSS which layout the children were built for. */
    sections?: boolean;
    highlight?: readonly SearchWord[];
  },
): VNode {
  const ctx: MarkdownRenderCtx = {
    headings,
    headingIndex: 0,
    taskList: opts?.taskList,
    pathLinker: opts?.pathLinker,
    taskIndex: 0,
    highlight: opts?.highlight,
  };
  return (
    <div class={opts?.sections ? "md md-sections" : "md"}>
      {renderChildren(root.children, "md", ctx)}
    </div>
  );
}

// `useMemo` keyed on `source`: parse + render は接続状態の変化等で高頻度に
// re-render される親の下で使われるため、source が変わっていなければ再パース
// しない。`<details>` (thinking の折り畳み等) は collapsed でも Preact が中身を
// 描画し続けるので、折り畳み自体はコスト削減にならない — この memo がそれを補う。
export function MarkdownView({
  source,
  tableOfContents = false,
  restricted = false,
  taskList,
  pathLinker,
  foldSections = false,
  highlight,
}: {
  source: string;
  tableOfContents?: boolean;
  /** Text a person typed. In restricted mode only inline code, fenced code
   * blocks and blockquotes render as markdown; everything else (headings,
   * lists, tables, emphasis, links, HTML) is shown verbatim, so someone typing
   * `#123 の件` does not lose the line to an H1 and `<R G B>` is not eaten as an
   * HTML tag or autolink. `tableOfContents`, `taskList` and `foldSections` do
   * not apply in this mode. */
  restricted?: boolean;
  /** Interactive task lists. A message body has no file behind it to write a
   * toggle back to, so only a view of a writable document passes this. */
  taskList?: MarkdownTaskListCtx;
  /** Where a path-shaped link opens. A screen that shows files answers this;
   * one that does not leaves such links inert (see the `path` case of
   * `renderNode`). */
  pathLinker?: MarkdownPathLinker;
  /** Collapsible `##`-and-deeper sections. A turn in a timeline is a message,
   * not a document — its headings are a few lines apart and a caret per heading
   * would be noise — so only a view of a document asks for them. */
  foldSections?: boolean;
  /** 探している言葉。地の文の一致を `<mark>` で囲む。 */
  highlight?: readonly SearchWord[];
}) {
  // One store per document: section keys are positions in *this* source, so a
  // different source has to start from the default (everything open) rather
  // than inherit a previous document's collapsed positions.
  const sectionFold = foldSections && !restricted;
  const sectionStore = useMemo(() => new FoldOpen(), [source, sectionFold]);
  return useMemo(() => {
    if (restricted) return renderRestrictedMarkdown(source, pathLinker, highlight);
    const parsed = parseMarkdownDocument(source);
    const headings = tableOfContents ? extractMarkdownHeadings(parsed) : [];
    const root = sectionFold
      ? { ...parsed, children: foldMarkdownSections(parsed.children) as RootContent[] }
      : parsed;
    const markdown = renderMarkdownAst(root, tableOfContents ? headings : undefined, {
      taskList,
      pathLinker,
      sections: sectionFold,
      highlight,
    });
    const withFold = sectionFold ? (
      <MarkdownSectionFoldContext.Provider
        value={{ store: sectionStore, allKeys: collectMarkdownSectionKeys(root.children) }}
      >
        {markdown}
      </MarkdownSectionFoldContext.Provider>
    ) : (
      markdown
    );
    if (headings.length <= 1) return withFold;

    return (
      <div class="md-document">
        <details class="md-toc" open={headings.length <= 6}>
          <summary>目次</summary>
          <nav aria-label="目次">
            <ol>
              {headings.map((heading) => (
                <li
                  key={heading.id}
                  class={`md-toc-depth-${heading.depth}`}
                  style={{ "--md-toc-depth": heading.depth - 1 }}
                >
                  <a
                    href={`#${heading.id}`}
                    onClick={(event) => {
                      // The app's own URL owns routing, so keep the anchor URL
                      // for semantics but scroll without navigating.
                      event.preventDefault();
                      revealMarkdownAnchor(heading.id, sectionFold ? sectionStore : null);
                    }}
                  >
                    <span class="md-toc-number">{heading.number}</span>
                    <span>{heading.text}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </details>
        {withFold}
      </div>
    );
  }, [
    source,
    tableOfContents,
    restricted,
    taskList,
    pathLinker,
    sectionFold,
    sectionStore,
    highlight,
  ]);
}
