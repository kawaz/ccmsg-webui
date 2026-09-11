import { type InstanceId, type TopicGranularity, topicGranularity } from "@ccmsg/protocol";

/** How a subscriber folds topic frames into what it already holds.
 *
 * The rule is the contract's `TOPIC_ATTRIBUTES.granularity`, read at runtime
 * from the topic name, so this holds no table of its own: a topic added to the
 * contract folds correctly here without this file being touched.
 *
 * What a fold produces is always a list of slots, one per instance that has
 * spoken, in the order they first did. `whole` differs from
 * `per_instance_whole` only in what keys a slot — one slot for the topic
 * against one slot per instance — so both are the same operation with a
 * different key, and a reader has one shape to read either through. */

export interface Slot<T> {
  readonly instance: InstanceId;
  readonly data: T;
}

/** The granularities `TopicFold` folds into slots. The other two are held by
 * the folds below instead, since what they hold is not a value each instance
 * states whole: `element` is a set of rows a frame touches part of, and
 * `append` a stretch of a growing value. */
const FOLDABLE: readonly TopicGranularity[] = ["whole", "per_instance_whole", "event"];

export function isFoldable(topic: string): boolean {
  const granularity = topicGranularity(topic);
  return granularity !== undefined && FOLDABLE.includes(granularity);
}

/** The slots of one topic, folded as its granularity says. */
export class TopicFold<T> {
  readonly #granularity: TopicGranularity;
  #slots: readonly Slot<T>[] = [];

  constructor(topic: string) {
    const granularity = topicGranularity(topic);
    if (granularity === undefined) throw new Error(`unknown topic ${topic}`);
    if (!FOLDABLE.includes(granularity)) {
      throw new Error(`topic ${topic} folds as ${granularity}, which this build does not hold`);
    }
    this.#granularity = granularity;
  }

  get slots(): readonly Slot<T>[] {
    return this.#slots;
  }

  /** Take one frame. Answers the slots after it, so a caller assigns the result
   * rather than reading a field it has to know was just mutated. */
  push(instance: InstanceId, data: T): readonly Slot<T>[] {
    if (this.#granularity === "event") return this.#slots;
    const slot: Slot<T> = { instance, data };
    // A whole-value topic holds one slot whoever sent it: one session lives on
    // one instance, so there is no other instance's half to leave alone.
    if (this.#granularity === "whole") {
      this.#slots = [slot];
      return this.#slots;
    }
    const at = this.#slots.findIndex((one) => one.instance === instance);
    this.#slots =
      at < 0
        ? [...this.#slots, slot]
        : this.#slots.map((one, index) => (index === at ? slot : one));
    return this.#slots;
  }

  /** Forget what one instance said, for a connection that dropped: what it
   * knew is no longer being kept current, and stale rows read as live ones. */
  forget(instance: InstanceId): readonly Slot<T>[] {
    this.#slots = this.#slots.filter((one) => one.instance !== instance);
    return this.#slots;
  }
}

/** The rows of an `element` topic, held per instance that sent them.
 *
 * What a frame carries is the rows that changed, matched by a key of their own,
 * and rows it does not name are left as they were — so a row that moves on its
 * own (one session becoming busy) travels as that row rather than as the list
 * it sits in. A departure is therefore a marked element: an absence in a frame
 * that carries only what changed says nothing, so a row leaves only when one
 * arrives saying `removed`.
 *
 * The opening `snapshot: true` frame is the whole of what its sender holds, so
 * it replaces that sender's rows rather than adding to them; a row the sender
 * has since forgotten would otherwise outlive the only frame that could have
 * removed it.
 *
 * Per sender, like every fold here: one instance's rows are the ones it keeps
 * current, and `forget` drops them whole when it stops speaking. What the key
 * is made of belongs to the topic and is given by the caller — the contract
 * says a row is matched by a key of its own, not what that key is called.
 *
 * `E` is what a frame carries and `R` what is held — the same type less its
 * removals, which is what a reader of the slots gets: nothing marked `removed`
 * survives a fold, since that mark is the instruction to drop a row rather than
 * a row to keep. */
export class ElementFold<E, R extends E = E> {
  readonly #key: (element: E) => string;
  #held: readonly { instance: InstanceId; rows: Map<string, R> }[] = [];

  constructor(topic: string, key: (element: E) => string) {
    const granularity = topicGranularity(topic);
    if (granularity === undefined) throw new Error(`unknown topic ${topic}`);
    if (granularity !== "element") {
      throw new Error(`topic ${topic} folds as ${granularity}, which this fold does not hold`);
    }
    this.#key = key;
  }

  get slots(): readonly Slot<readonly R[]>[] {
    return this.#held.map((one) => ({ instance: one.instance, data: [...one.rows.values()] }));
  }

  /** Take one frame: its rows over what that instance already held, or in place
   * of them when it is the opening snapshot. */
  push(
    instance: InstanceId,
    elements: readonly E[],
    snapshot: boolean,
  ): readonly Slot<readonly R[]>[] {
    const at = this.#held.findIndex((one) => one.instance === instance);
    const rows = at < 0 || snapshot ? new Map<string, R>() : new Map(this.#held[at]?.rows);
    for (const element of elements) {
      const key = this.#key(element);
      // Past the mark there is a row rather than a departure, which is the
      // whole of what `R` says: the narrowing is this test and nothing a
      // signature can carry, since what is removable is the topic's own shape.
      if (isRemoval(element)) rows.delete(key);
      else rows.set(key, element as R);
    }
    const slot = { instance, rows };
    this.#held =
      at < 0 ? [...this.#held, slot] : this.#held.map((one, index) => (index === at ? slot : one));
    return this.slots;
  }

  forget(instance: InstanceId): readonly Slot<readonly R[]>[] {
    this.#held = this.#held.filter((one) => one.instance !== instance);
    return this.slots;
  }
}

/** Whether an element says its row is gone. The mark the contract puts on every
 * element topic's departures, so this reads it rather than each topic's own. */
function isRemoval(element: unknown): boolean {
  return (
    typeof element === "object" &&
    element !== null &&
    (element as { removed?: unknown }).removed === true
  );
}

/** Every instance's rows, concatenated — the same union `union` below makes,
 * for a fold whose slots hold a list rather than a payload with lists in it. */
export function rows<E>(slots: readonly Slot<readonly E[]>[]): readonly E[] {
  return slots.flatMap((slot) => slot.data);
}

/** Every instance's list, concatenated — the union the contract describes as
 * what a subscriber of a `per_instance_whole` topic holds.
 *
 * The element type is read out of the named field rather than inferred beside
 * it: a payload with several lists (`peers` carries three) would otherwise let
 * inference settle on whichever one it reached first. */
export function union<S, K extends keyof S>(
  slots: readonly Slot<S>[],
  field: K,
): S[K] extends readonly (infer T)[] ? readonly T[] : never {
  return slots.flatMap((slot) => slot.data[field] as readonly unknown[]) as never;
}

/** What an `append` topic's subscriber holds: a contiguous stretch of a value
 * that is only ever added to, and where in the whole that stretch sits.
 *
 * The offsets are bytes, and are the same ones `transcript_read` pages by, so
 * what arrives live and what is read back stitch onto each other without
 * anything being read twice or counted twice. */
export interface AppendWindow {
  /** Byte offset of the first line held; zero once the beginning is held. */
  readonly start: number;
  /** Byte offset just past the last line held. */
  readonly end: number;
  readonly lines: readonly string[];
}

/** One frame of an `append` topic, or one `transcript_read` reply — the two say
 * the same thing, which is why one fold takes both. */
export interface AppendPart {
  readonly lines: readonly string[];
  readonly start: number;
  readonly end: number;
}

/** The fold of an `append` topic: what a frame carries is added to what is
 * held, and nothing already held is ever rewritten.
 *
 * A subscriber of such a topic learns from the opening snapshot only where the
 * value currently ends — sending the whole of it on every line would be sending
 * the file over and over — so the window starts empty at that point and is
 * filled from two directions: frames add to its end, and reads add to its
 * start. A part that neither abuts nor overlaps the window is a gap, and a gap
 * is refused rather than closed by pretending two stretches are adjacent.
 *
 * How much it holds is bounded by `windowBytes`, if one is given. What a
 * subscriber follows is a value that only grows, so without a bound a screen
 * left open holds the whole of it; past the bound the oldest lines are let go
 * of, whole lines at a time, and what was let go of is exactly what
 * `transcript_read` answers — the same path that fills the start of a window
 * that was never at the beginning. The bound is applied where the window grows
 * at its end, so a page someone asked for is not taken back out from under
 * them by the read that fetched it. */
export class AppendFold {
  #start = 0;
  #end = 0;
  #lines: readonly string[] = [];
  #size = 0;
  readonly #windowBytes: number | undefined;
  /** Whether the window sits anywhere yet. Until something says where the value
   * is being read — a snapshot, a read, or an append — an empty window at zero
   * and an empty window at the end of a large file are the same two numbers. */
  #pinned = false;

  constructor(topic: string, windowBytes?: number) {
    const granularity = topicGranularity(topic);
    if (granularity === undefined) throw new Error(`unknown topic ${topic}`);
    if (granularity !== "append") {
      throw new Error(`topic ${topic} folds as ${granularity}, which this fold does not hold`);
    }
    this.#windowBytes = windowBytes;
  }

  get window(): AppendWindow {
    return { start: this.#start, end: this.#end, lines: this.#lines };
  }

  /** How long the value is now, as the instance last stated it. Ahead of
   * `window.end` exactly when there is appended text this has not taken yet. */
  get size(): number {
    return this.#size;
  }

  /** Whether the beginning is held, which is what says there is nothing older
   * left to read. A window that sits nowhere yet holds neither end. */
  get atBeginning(): boolean {
    return this.#pinned && this.#start === 0;
  }

  /** Whether the window sits anywhere yet. */
  get pinned(): boolean {
    return this.#pinned;
  }

  /** Take the opening snapshot: where the value ends now.
   *
   * On a first subscription that is where everything to follow begins, so the
   * window is pinned there, empty. On a later one — a subscription restored
   * after a reconnection — what is held is still what the file says, unless the
   * file is now shorter than what was read, which is a different file. */
  begin(size: number): AppendWindow {
    this.#size = Math.max(this.#size, size);
    if (this.#pinned && size >= this.#end) return this.window;
    this.#start = size;
    this.#end = size;
    this.#lines = [];
    this.#size = size;
    this.#pinned = true;
    return this.window;
  }

  /** Take what was appended. A part that starts before the window ends is
   * already held in part, and only the lines past the end are taken; one that
   * starts after it leaves a gap, and is refused. */
  append(part: AppendPart, size: number = part.end): AppendWindow {
    this.#size = Math.max(this.#size, size);
    if (!this.#pinned) return this.#pin(part);
    if (part.start > this.#end) {
      throw new Error(`append at ${part.start} leaves a gap after ${this.#end}`);
    }
    if (part.end <= this.#end) return this.window;
    this.#lines = [...this.#lines, ...linesFrom(part, this.#end)];
    this.#end = part.end;
    this.#letGoOfTheOldest();
    return this.window;
  }

  /** Take what was read from before the window. A part reaching past the
   * window's start is trimmed to what is not held; one ending before it leaves
   * a gap, and is refused. */
  prepend(part: AppendPart, size?: number): AppendWindow {
    if (size !== undefined) this.#size = Math.max(this.#size, size);
    // The first read arrives while the window is still the empty point the
    // snapshot pinned, so a read of the tail lands on it rather than before it.
    if (!this.#pinned || (this.#lines.length === 0 && part.end <= this.#end)) {
      return this.#pin(part);
    }
    if (part.end < this.#start) {
      throw new Error(`read ending at ${part.end} leaves a gap before ${this.#start}`);
    }
    if (part.start > this.#end) {
      throw new Error(`read at ${part.start} leaves a gap after ${this.#end}`);
    }
    if (part.start >= this.#start) return this.window;
    this.#lines = [...linesUntil(part, this.#start), ...this.#lines];
    this.#start = part.start;
    return this.window;
  }

  /** Let go of leading lines until the window is within its bound.
   *
   * Whole lines only: half a line is not something the model layer above can
   * read, and `start` has to stay an offset a read can be asked to reach. The
   * last line is always kept, so a bound smaller than one line leaves a window
   * that still sits where the value ends rather than nowhere. */
  #letGoOfTheOldest(): void {
    if (this.#windowBytes === undefined) return;
    let start = this.#start;
    let dropped = 0;
    while (dropped < this.#lines.length - 1 && this.#end - start > this.#windowBytes) {
      start += lineByteLength(this.#lines[dropped]!);
      dropped += 1;
    }
    if (dropped === 0) return;
    this.#lines = this.#lines.slice(dropped);
    this.#start = start;
  }

  /** Put the window where a part says it is, holding that part. */
  #pin(part: AppendPart): AppendWindow {
    this.#start = part.start;
    this.#end = part.end;
    this.#lines = [...part.lines];
    this.#size = Math.max(this.#size, part.end);
    this.#pinned = true;
    return this.window;
  }
}

/** The lines of a part that begin at or after `offset`, found by walking the
 * part's own byte lengths — the same arithmetic the offsets were made with. */
function linesFrom(part: AppendPart, offset: number): readonly string[] {
  const kept: string[] = [];
  let at = part.start;
  for (const line of part.lines) {
    if (at >= offset) kept.push(line);
    at += lineByteLength(line);
  }
  return kept;
}

/** The lines of a part that end at or before `offset`. */
function linesUntil(part: AppendPart, offset: number): readonly string[] {
  const kept: string[] = [];
  let at = part.start;
  for (const line of part.lines) {
    const next = at + lineByteLength(line);
    if (next <= offset) kept.push(line);
    at = next;
  }
  return kept;
}

const TEXT_ENCODER = new TextEncoder();

/** A line's size in the file: its own bytes plus the newline that ends it,
 * which is what the offsets count. */
function lineByteLength(line: string): number {
  return TEXT_ENCODER.encode(line).length + 1;
}
