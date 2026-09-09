import type { ComponentChildren } from "preact";
import type { FoldOpen } from "../timeline/fold-open.ts";

/** A fold whose open/closed state is held outside it (see fold-open.ts), and
 * whose body is drawn only once it has been open.
 *
 * Most of a transcript lives inside a fold, so drawing every closed body would
 * mean rendering — and highlighting — a whole session to show the few lines
 * anyone is reading. Once drawn the body stays: closing a fold is not meant to
 * throw away the work of having opened it. */
export function Fold({
  class: className,
  folds,
  foldKey,
  fallback,
  summary,
  children,
}: {
  class: string;
  folds: FoldOpen;
  foldKey: string;
  /** Open unless the reader has said otherwise for this fold. */
  fallback: boolean;
  summary: string;
  children: ComponentChildren;
}) {
  const open = folds.isOpen(foldKey, fallback);
  if (open) folds.markMounted(foldKey);
  return (
    <details
      class={className}
      open={open}
      onToggle={(event) => {
        folds.set(foldKey, (event.currentTarget as HTMLDetailsElement).open);
      }}
    >
      <summary>{summary}</summary>
      {folds.isBodyMounted(foldKey) ? children : null}
    </details>
  );
}
