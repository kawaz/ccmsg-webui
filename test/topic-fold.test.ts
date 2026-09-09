import { describe, expect, test } from "bun:test";
import { isFoldable, TopicFold, union } from "../src/topic-fold.ts";

/** How frames fold into what is already held (contract, "観測系は snapshot +
 * delta の 1 形"). The rule is read from the contract's granularity table, so
 * the cases here are about the folds themselves rather than about which topic
 * has which. */

const A = "ws://a.example/ws";
const B = "ws://b.example/ws";

describe("per_instance_whole", () => {
  test("a frame replaces its own instance's entries and leaves the others'", () => {
    const fold = new TopicFold<{ peers: string[] }>("peers");
    fold.push(A, { peers: ["a1", "a2"] });
    fold.push(B, { peers: ["b1"] });
    expect(union(fold.slots, "peers")).toEqual(["a1", "a2", "b1"]);
    // A second frame from A says the whole of what A knows now, which is one
    // session: B's entry is untouched.
    const after = fold.push(A, { peers: ["a2"] });
    expect(union(after, "peers")).toEqual(["a2", "b1"]);
  });

  test("an instance that stops speaking takes its entries with it", () => {
    const fold = new TopicFold<{ peers: string[] }>("peers");
    fold.push(A, { peers: ["a1"] });
    fold.push(B, { peers: ["b1"] });
    expect(union(fold.forget(A), "peers")).toEqual(["b1"]);
  });
});

describe("whole", () => {
  test("a frame replaces everything held, whichever instance sent it", () => {
    // One session lives on one instance, so its status has no other instance's
    // half to leave alone.
    const fold = new TopicFold<{ n: number }>(
      "session_status:00000000-0000-0000-0000-000000000000",
    );
    fold.push(A, { n: 1 });
    const after = fold.push(B, { n: 2 });
    expect(after).toEqual([{ instance: B, data: { n: 2 } }]);
  });
});

describe("event", () => {
  test("nothing is held, so subscribing yields no current value", () => {
    const fold = new TopicFold<{ n: number }>("notify");
    expect(fold.push(A, { n: 1 })).toEqual([]);
  });
});

describe("what this build refuses", () => {
  test("a topic folding as append or element is refused rather than half-held", () => {
    expect(isFoldable("peers")).toBe(true);
    expect(isFoldable("transcript:00000000-0000-0000-0000-000000000000")).toBe(false);
    expect(isFoldable("inbox")).toBe(false);
    expect(() => new TopicFold("inbox")).toThrow(/element/);
  });

  test("a name this generation does not define is refused", () => {
    expect(isFoldable("nonsense")).toBe(false);
    expect(() => new TopicFold("nonsense")).toThrow(/unknown topic/);
  });
});
