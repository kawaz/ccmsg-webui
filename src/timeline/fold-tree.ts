// Which folds enclose a given transcript line, decided from the model rather
// than from the DOM. Timeline mounts a closed fold's body lazily (72-96% of
// every entry in a real transcript lives inside one, see
// docs/findings/2026-08-12-timeline-windowing-design.md), so "scroll to this
// line" can no longer start by looking the element up: the element does not
// exist until its enclosing folds are open. These keys name the folds to open
// first, and match the keys FoldGroup registers itself under.
import type { FoldOpen } from "./fold-open.ts";
import {
  foldGroupNeedsOuterFold,
  type TimelineEntry,
  type TimelineGroup,
} from "./transcript-model.ts";

/** Keyed by first entry offset, the same value Timeline already uses as the
 * component's Preact key — stable across live-tail appends and "load older"
 * prepends for the same reason (transcript-model.ts's lineByteOffsets doc). */
export function foldGroupKey(entries: readonly TimelineEntry[]): string {
  return `fold:${entries[0]!.offset}`;
}

/** The key of one thinking block's fold: the line it is in, and where in that
 * line it sits (one line carries several segments). */
export function thinkFoldKey(offset: number, index: number): string {
  return `think:${offset}:${index}`;
}

/** Forget what the reader did to folds the timeline no longer holds — the
 * folds of every line before `start`, which is where the held window begins
 * once the oldest lines have been let go of.
 *
 * The rule lives here because it is the keys that decide it, and the keys are
 * made here: a fold whose line is gone is named by an offset outside the
 * window, and nothing else in the store is. */
export function forgetFoldsBefore(folds: FoldOpen, start: number): void {
  if (start === 0) return;
  folds.drop((key) => {
    const at = foldKeyOffset(key);
    return at !== undefined && at < start;
  });
}

/** Which line a timeline fold's key names. Every key this file makes names its
 * line first; anything else is not one of them. */
function foldKeyOffset(key: string): number | undefined {
  const [kind, offset] = key.split(":");
  if (kind !== "fold" && kind !== "think") return undefined;
  const at = Number(offset);
  return Number.isInteger(at) ? at : undefined;
}

/**
 * For every line offset, the folds enclosing it from outermost to innermost.
 * Empty for a line that is always mounted (a boundary bubble, or a hoisted
 * single-item fold group).
 *
 * Mirrors FoldGroup's own render decision exactly: a group that renders no
 * `<details>` (foldGroupNeedsOuterFold) encloses nothing. A key listed here
 * that never gets a fold in the DOM would strand a nav target as un-openable,
 * so the two must agree.
 */
export function foldPathsByOffset(groups: readonly TimelineGroup[]): Map<number, string[]> {
  const paths = new Map<number, string[]>();
  for (const group of groups) {
    if (group.kind !== "fold") continue;
    const path = foldGroupNeedsOuterFold(group.entries) ? [foldGroupKey(group.entries)] : [];
    for (const entry of group.entries) paths.set(entry.offset, path);
  }
  return paths;
}
