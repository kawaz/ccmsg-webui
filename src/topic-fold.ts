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

/** The granularities `TopicFold` folds into slots. `append` is held by
 * `AppendFold` below instead, since what it holds is a stretch of a growing
 * value rather than a value each instance states whole; `element` belongs to
 * topics no screen here subscribes to yet, and refusing at subscription is what
 * keeps an unfolded topic from being read as an empty one. */
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
 * is refused rather than closed by pretending two stretches are adjacent. */
export class AppendFold {
  #start = 0;
  #end = 0;
  #lines: readonly string[] = [];
  #size = 0;
  /** Whether the window sits anywhere yet. Until something says where the value
   * is being read — a snapshot, a read, or an append — an empty window at zero
   * and an empty window at the end of a large file are the same two numbers. */
  #pinned = false;

  constructor(topic: string) {
    const granularity = topicGranularity(topic);
    if (granularity === undefined) throw new Error(`unknown topic ${topic}`);
    if (granularity !== "append") {
      throw new Error(`topic ${topic} folds as ${granularity}, which this fold does not hold`);
    }
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
