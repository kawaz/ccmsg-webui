import { describe, expect, test } from "bun:test";
import { AppendFold, isFoldable, TopicFold, union } from "../src/topic-fold.ts";

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

describe("append", () => {
  const TOPIC = "transcript:00000000-0000-0000-0000-000000000000";
  // Byte offsets count each line plus the newline that ends it.
  const size = (...lines: string[]) => lines.reduce((n, line) => n + line.length + 1, 0);

  test("the snapshot pins where the value ends, and frames add to it", () => {
    const fold = new AppendFold(TOPIC);
    expect(fold.begin(120)).toEqual({ start: 120, end: 120, lines: [] });
    const after = fold.append({ lines: ["a", "bb"], start: 120, end: 120 + size("a", "bb") });
    expect(after.lines).toEqual(["a", "bb"]);
    expect(after.start).toBe(120);
    expect(after.end).toBe(125);
  });

  test("a read of the tail lands on the point the snapshot pinned", () => {
    const fold = new AppendFold(TOPIC);
    fold.begin(10);
    const after = fold.prepend({ lines: ["old"], start: 6, end: 10 }, 10);
    expect(after).toEqual({ start: 6, end: 10, lines: ["old"] });
    expect(fold.atBeginning).toBe(false);
  });

  test("reads add to the start until the beginning is held", () => {
    const fold = new AppendFold(TOPIC);
    fold.begin(8);
    fold.prepend({ lines: ["ccc"], start: 4, end: 8 });
    const after = fold.prepend({ lines: ["aaa"], start: 0, end: 4 });
    expect(after).toEqual({ start: 0, end: 8, lines: ["aaa", "ccc"] });
    expect(fold.atBeginning).toBe(true);
  });

  test("what is already held is never taken twice", () => {
    const fold = new AppendFold(TOPIC);
    fold.begin(4);
    fold.append({ lines: ["bbb"], start: 4, end: 8 });
    // A read racing the live tail answers lines that already arrived; only the
    // part before the window is new.
    const after = fold.prepend({ lines: ["aaa", "bbb"], start: 0, end: 8 });
    expect(after).toEqual({ start: 0, end: 8, lines: ["aaa", "bbb"] });
    // And a frame repeating what was read adds nothing.
    expect(fold.append({ lines: ["bbb"], start: 4, end: 8 }).lines).toEqual(["aaa", "bbb"]);
  });

  test("a gap is refused rather than closed by pretending", () => {
    const fold = new AppendFold(TOPIC);
    fold.begin(0);
    expect(() => fold.append({ lines: ["x"], start: 40, end: 42 })).toThrow(/gap/);
    fold.append({ lines: ["x"], start: 0, end: 2 });
    expect(() => fold.prepend({ lines: ["y"], start: 100, end: 102 })).toThrow(/gap/);
  });

  test("the size an instance states is what says there is more to take", () => {
    const fold = new AppendFold(TOPIC);
    fold.begin(0);
    fold.append({ lines: ["x"], start: 0, end: 2 }, 900);
    expect(fold.size).toBe(900);
    expect(fold.window.end).toBe(2);
  });

  test("a topic that does not fold as append is refused", () => {
    expect(() => new AppendFold("peers")).toThrow(/per_instance_whole/);
    expect(() => new AppendFold("nonsense")).toThrow(/unknown topic/);
  });
});

describe("append: where the window sits", () => {
  const TOPIC = "transcript:00000000-0000-0000-0000-000000000000";

  test("a read with no snapshot before it puts the window where the read was", () => {
    // What an instance that is not following this transcript looks like: the
    // subscription is accepted and no snapshot arrives, so the first read is
    // what says where the end is.
    const fold = new AppendFold(TOPIC);
    expect(fold.pinned).toBe(false);
    expect(fold.atBeginning).toBe(false);
    expect(fold.prepend({ lines: ["z"], start: 998, end: 1000 }, 1000)).toEqual({
      start: 998,
      end: 1000,
      lines: ["z"],
    });
  });

  test("a snapshot after a page has been read keeps what was read", () => {
    const fold = new AppendFold(TOPIC);
    fold.prepend({ lines: ["z"], start: 998, end: 1000 }, 1000);
    // What a restored subscription sends: the file still ends where it did.
    expect(fold.begin(1000).lines).toEqual(["z"]);
    // A file shorter than what was read is a different file.
    expect(fold.begin(4)).toEqual({ start: 4, end: 4, lines: [] });
  });
});
