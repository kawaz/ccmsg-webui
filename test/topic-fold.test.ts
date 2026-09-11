import { describe, expect, test } from "bun:test";
import { AppendFold, ElementFold, isFoldable, rows, TopicFold, union } from "../src/topic-fold.ts";

/** How frames fold into what is already held (contract, "観測系は snapshot +
 * delta の 1 形"). The rule is read from the contract's granularity table, so
 * the cases here are about the folds themselves rather than about which topic
 * has which. */

const A = "ws://a.example/ws";
const B = "ws://b.example/ws";

describe("per_instance_whole", () => {
  test("a frame replaces its own instance's entries and leaves the others'", () => {
    const fold = new TopicFold<{ instances: string[] }>("instances");
    fold.push(A, { instances: ["a1", "a2"] });
    fold.push(B, { instances: ["b1"] });
    expect(union(fold.slots, "instances")).toEqual(["a1", "a2", "b1"]);
    // A second frame from A says the whole of what A knows now, which is one
    // entry: B's is untouched.
    const after = fold.push(A, { instances: ["a2"] });
    expect(union(after, "instances")).toEqual(["a2", "b1"]);
  });

  test("an instance that stops speaking takes its entries with it", () => {
    const fold = new TopicFold<{ instances: string[] }>("instances");
    fold.push(A, { instances: ["a1"] });
    fold.push(B, { instances: ["b1"] });
    expect(union(fold.forget(A), "instances")).toEqual(["b1"]);
  });
});

describe("element", () => {
  interface Row {
    readonly instance: string;
    readonly sid: string;
    readonly state?: string;
    readonly removed?: true;
  }
  const key = (row: Row) => `${row.instance} ${row.sid}`;
  const fold = () => new ElementFold<Row, Row>("peers", key);

  test("a frame names the rows that changed and leaves every other row as it was", () => {
    const held = fold();
    held.push(
      A,
      [
        { instance: A, sid: "s1", state: "live" },
        { instance: A, sid: "s2" },
      ],
      true,
    );
    const after = held.push(A, [{ instance: A, sid: "s1", state: "waiting" }], false);
    expect(rows(after)).toEqual([
      { instance: A, sid: "s1", state: "waiting" },
      { instance: A, sid: "s2" },
    ]);
  });

  test("a row leaves on the mark it carries, since an absence says nothing", () => {
    const held = fold();
    held.push(
      A,
      [
        { instance: A, sid: "s1" },
        { instance: A, sid: "s2" },
      ],
      true,
    );
    const after = held.push(A, [{ instance: A, sid: "s1", removed: true }], false);
    expect(rows(after)).toEqual([{ instance: A, sid: "s2" }]);
  });

  test("the opening snapshot is the whole of what its sender holds", () => {
    const held = fold();
    held.push(
      A,
      [
        { instance: A, sid: "s1" },
        { instance: A, sid: "s2" },
      ],
      true,
    );
    const after = held.push(A, [{ instance: A, sid: "s2" }], true);
    expect(rows(after)).toEqual([{ instance: A, sid: "s2" }]);
  });

  test("one sender's snapshot leaves another sender's rows alone", () => {
    const held = fold();
    held.push(A, [{ instance: A, sid: "s1" }], true);
    held.push(B, [{ instance: B, sid: "s2" }], true);
    expect(rows(held.push(A, [], true))).toEqual([{ instance: B, sid: "s2" }]);
    expect(rows(held.forget(B))).toEqual([]);
  });

  test("rows are matched by instance and sid together, not by sid alone", () => {
    const held = fold();
    held.push(A, [{ instance: A, sid: "s1", state: "live" }], true);
    const after = held.push(A, [{ instance: B, sid: "s1", state: "paused" }], false);
    expect(rows(after)).toEqual([
      { instance: A, sid: "s1", state: "live" },
      { instance: B, sid: "s1", state: "paused" },
    ]);
  });
});

describe("whole", () => {
  test("a frame replaces everything held, whichever instance sent it", () => {
    // One session lives on one instance, so its status has no other instance's
    // half to leave alone.
    const fold = new TopicFold<{ n: number }>(
      "session.status:00000000-0000-0000-0000-000000000000",
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
  test("a topic is held by the fold its granularity names and by no other", () => {
    expect(isFoldable("instances")).toBe(true);
    expect(isFoldable("transcript:00000000-0000-0000-0000-000000000000")).toBe(false);
    expect(isFoldable("peers")).toBe(false);
    expect(() => new TopicFold("peers")).toThrow(/element/);
    expect(() => new ElementFold("instances", () => "")).toThrow(/per_instance_whole/);
  });

  test("a name this generation does not define is refused", () => {
    expect(isFoldable("nonsense")).toBe(false);
    expect(() => new TopicFold("nonsense")).toThrow(/unknown topic/);
    expect(() => new ElementFold("nonsense", () => "")).toThrow(/unknown topic/);
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
    expect(() => new AppendFold("instances")).toThrow(/per_instance_whole/);
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

describe("append: 窓の大きさ", () => {
  const TOPIC = "transcript:00000000-0000-0000-0000-000000000000";
  // 1 行 = 本文 + 改行。ここでは 4 byte 固定にして、窓の byte 数で数える。
  const line = (n: number) => `l${String(n).padStart(2, "0")}`;

  test("末尾が伸びた分だけ先頭を落とし、行の途中では切らない", () => {
    const fold = new AppendFold(TOPIC, 10);
    fold.begin(0);
    for (let n = 0; n < 5; n++) {
      fold.append({ lines: [line(n)], start: n * 4, end: (n + 1) * 4 });
    }
    // 20 byte 追記されたが、窓は 10 byte を超えない最大の行境界 (8 byte) で止まる。
    expect(fold.window).toEqual({ start: 12, end: 20, lines: [line(3), line(4)] });
    expect(fold.size).toBe(20);
  });

  test("落ちた先には遡り読みで戻せる (先頭を持っていないと言い続ける)", () => {
    const fold = new AppendFold(TOPIC, 10);
    fold.begin(0);
    for (let n = 0; n < 5; n++) {
      fold.append({ lines: [line(n)], start: n * 4, end: (n + 1) * 4 });
    }
    expect(fold.atBeginning).toBe(false);
    const after = fold.prepend({ lines: [line(1), line(2)], start: 4, end: 12 });
    expect(after).toEqual({ start: 4, end: 20, lines: [line(1), line(2), line(3), line(4)] });
    // 読み手が求めた頁は、それを取ってきた read には取り上げられない。
    expect(fold.window.start).toBe(4);
  });

  test("窓より大きい 1 行は落とさない (窓はどこかに在り続ける)", () => {
    const fold = new AppendFold(TOPIC, 4);
    fold.begin(0);
    fold.append({ lines: ["0123456789"], start: 0, end: 11 });
    expect(fold.window.lines).toEqual(["0123456789"]);
  });

  test("窓を言わない fold は何も落とさない", () => {
    const fold = new AppendFold(TOPIC);
    fold.begin(0);
    for (let n = 0; n < 5; n++) {
      fold.append({ lines: [line(n)], start: n * 4, end: (n + 1) * 4 });
    }
    expect(fold.window.start).toBe(0);
    expect(fold.atBeginning).toBe(true);
  });
});

describe("append: 重なりと、穴からの復帰", () => {
  const TOPIC = "transcript:00000000-0000-0000-0000-000000000000";

  test("窓の端に 1 行だけ重なる read は、その 1 行を二重に持たない", () => {
    const fold = new AppendFold(TOPIC);
    fold.begin(4);
    // 窓: "bb" "cc" (4..10)
    fold.append({ lines: ["bb", "cc"], start: 4, end: 10 });
    // read が 1 行ぶん先まで答える (生で受け取った "bb" と重なる)
    const after = fold.prepend({ lines: ["aa", "bb"], start: 0, end: 7 });
    expect(after).toEqual({ start: 0, end: 10, lines: ["aa", "bb", "cc"] });
  });

  test("穴の後に窓を置き直せば、次の append はどこから来ても取れる", () => {
    // 穴を踏んだ側は新しい fold を作って読み直す (TranscriptView の restart)。
    // 置き直した fold は「まだどこにも無い」ので、次に来たものがどこであれ
    // そこに窓を据える — 同じ穴で throw し続けるループにはならない。
    const fold = new AppendFold(TOPIC);
    fold.begin(0);
    expect(() => fold.append({ lines: ["x"], start: 900, end: 902 })).toThrow(/gap/);
    const fresh = new AppendFold(TOPIC);
    expect(fresh.append({ lines: ["x"], start: 900, end: 902 }, 902)).toEqual({
      start: 900,
      end: 902,
      lines: ["x"],
    });
  });
});
