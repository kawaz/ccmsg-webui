import { batch, signal, type Signal } from "@preact/signals";

/** Whether each fold in one timeline is open, held outside the components that
 * draw them.
 *
 * A fold's state has to outlive its component: the timeline unmounts folds as
 * the window of held lines moves, and a fold that came back closed because its
 * element was recycled would read as the app forgetting what the reader did.
 *
 * One signal per key rather than one signal holding a map. A component reads
 * the key it draws and re-renders when that key changes, so opening one fold
 * leaves every other fold in the timeline alone — which is the whole reason the
 * state is out here rather than in the component.
 *
 * Only folds the reader has actually touched are recorded. Absent means "still
 * at the caller's default", which is how a change to the auto-open settings
 * takes effect without this store knowing what any fold's default is. */
export class FoldOpen {
  readonly #overrides = new Map<string, Signal<boolean | undefined>>();
  /** Folds whose body has been drawn once. Re-closing keeps the body around:
   * it holds work the reader would notice losing — a code block's highlighting
   * is tokenized asynchronously — and re-opening is meant to look like it was
   * never closed. */
  readonly #mounted = new Map<string, Signal<boolean>>();

  #override(key: string): Signal<boolean | undefined> {
    const held = this.#overrides.get(key);
    if (held !== undefined) return held;
    const made = signal<boolean | undefined>(undefined);
    this.#overrides.set(key, made);
    return made;
  }

  #mount(key: string): Signal<boolean> {
    const held = this.#mounted.get(key);
    if (held !== undefined) return held;
    const made = signal(false);
    this.#mounted.set(key, made);
    return made;
  }

  isOpen(key: string, fallback: boolean): boolean {
    return this.#override(key).value ?? fallback;
  }

  /** Whether this fold's body should be drawn: open now, or open before. */
  isBodyMounted(key: string): boolean {
    return this.#mount(key).value;
  }

  /** Latch a fold whose body is being drawn without anyone having opened it —
   * a fold the settings open starts open, so nothing calls `set` on it. */
  markMounted(key: string): void {
    const mounted = this.#mount(key);
    if (!mounted.peek()) mounted.value = true;
  }

  set(key: string, open: boolean): void {
    batch(() => {
      if (open) this.markMounted(key);
      this.#override(key).value = open;
    });
  }

  /** Back to every fold's own default, which is what a change to the auto-open
   * settings asks for. The mounted latch deliberately survives — new defaults
   * re-close folds, they do not discard what is inside them. */
  reset(): void {
    batch(() => {
      for (const held of this.#overrides.values()) held.value = undefined;
    });
  }
}
