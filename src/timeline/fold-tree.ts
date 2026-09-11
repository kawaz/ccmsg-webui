// Which folds enclose a given item, decided from the model rather than from the
// DOM. Timeline mounts a closed fold's body lazily (most of what a transcript
// holds lives inside one, see
// docs/findings/2026-08-12-timeline-windowing-design.md), so "scroll to this
// item" cannot start by looking the element up: the element does not exist
// until its enclosing folds are open. These keys name the folds to open first,
// and match the keys Timeline registers them under.
import type { ItemRow, TimelineNode } from "./items.ts";
import type { FoldOpen } from "./fold-open.ts";

/** Keyed by the first item's id, the same value Timeline uses as the
 * component's Preact key — an id names the record an item came from and where
 * in it the item stood, so it keeps naming the same item however the held
 * range grows at either end. */
export function foldGroupKey(rows: readonly ItemRow[]): string {
  return `fold:${(rows[0] as ItemRow).item.id}`;
}

/** The key of one thinking item's fold. */
export function thinkFoldKey(id: string): string {
  return `think:${id}`;
}

/** The key of one message's own fold — the label above it, which closes the
 * body down to a line. */
export function messageFoldKey(id: string): string {
  return `msg:${id}`;
}

/** The fold an item carries itself, when it has a body of its own to close.
 * A line naming what happened has none: there is nothing under it to hide. */
export function ownFoldKey(type: string, id: string): string | undefined {
  if (type === "thinking") return thinkFoldKey(id);
  return type.startsWith("message.") ? messageFoldKey(id) : undefined;
}

/** The key of one record's raw line, shown under any item read from it. Keyed
 * by the record rather than by the item: opening the line behind one item is
 * opening the same line for its siblings. */
export function rawFoldKey(uuid: string): string {
  return `raw:${uuid}`;
}

/** Forget what the reader did to folds the timeline no longer holds.
 *
 * Unmounting is not what this is for — a fold scrolled out of view comes back.
 * This is for an item the timeline has let go of: what the fold recorded is
 * about something that would have to be read again to be on the screen, and a
 * read answers the reader's default rather than what they once did. */
export function forgetFoldsOutside(folds: FoldOpen, held: ReadonlySet<string>): void {
  folds.drop((key) => {
    const named = foldKeyNames(key);
    return named !== undefined && !held.has(named);
  });
}

/** What a timeline fold's key names. Every key this file makes names it first;
 * anything else is not one of them. */
function foldKeyNames(key: string): string | undefined {
  const at = key.indexOf(":");
  const kind = key.slice(0, at);
  if (kind !== "fold" && kind !== "think" && kind !== "msg" && kind !== "raw") return undefined;
  return key.slice(at + 1);
}

/** For every item, the folds enclosing it from outermost to innermost — the
 * group's fold when it is in one, then the fold the item carries itself.
 *
 * Mirrors Timeline's own render decision: a key listed here that never gets a
 * fold in the DOM would strand a search hit as un-openable. */
export function foldPathsById(nodes: readonly TimelineNode[]): Map<string, string[]> {
  const paths = new Map<string, string[]>();
  const place = (row: ItemRow, outer: readonly string[]) => {
    const own = ownFoldKey(row.item.type, row.item.id);
    paths.set(row.item.id, own === undefined ? [...outer] : [...outer, own]);
  };
  for (const node of nodes) {
    if (node.kind === "row") {
      place(node.row, []);
      continue;
    }
    const outer = [foldGroupKey(node.rows)];
    for (const row of node.rows) place(row, outer);
  }
  return paths;
}
