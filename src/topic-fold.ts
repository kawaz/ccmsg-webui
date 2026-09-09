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

/** The granularities this build folds. `append` and `element` belong to topics
 * no screen here subscribes to yet; refusing at subscription is what keeps an
 * unfolded topic from being read as an empty one. */
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
