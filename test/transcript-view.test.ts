// 取得層: 生で届く追記と `transcript_read` の遡り読みを 1 つの窓に集める所。
// ここで固定するのは「窓が際限なく伸びないこと」と「同じ区間を 2 度持たない
// こと」で、どちらも行の byte 位置が繋ぎ目になっている。
import { describe, expect, test } from "bun:test";
import type { Sid, TopicName } from "@ccmsg/protocol";
import { TranscriptView, type TranscriptPort } from "../src/timeline/transcript-view.ts";

const SID = "00000000-0000-0000-0000-000000000000" as Sid;

/** 1 行 = 1 つの user turn。どの行も同じ長さにして、窓の byte 数を行数で数える。 */
function line(n: number): string {
  return JSON.stringify({
    type: "user",
    timestamp: "2026-07-10T12:34:56.000Z",
    message: { role: "user", content: `m${String(n).padStart(8, "0")}` },
  });
}

const LINE_BYTES = new TextEncoder().encode(line(0)).length + 1;

/** 何も答えない port。読みは呼ばれた記録だけ残して未解決のままにする。 */
class SilentPort implements TranscriptPort {
  readonly subscribed: TopicName[] = [];
  readonly reads: Record<string, unknown>[] = [];
  reply: ((args: Record<string, unknown>) => Record<string, unknown>) | undefined;

  subscribe(topic: TopicName): void {
    this.subscribed.push(topic);
  }
  unsubscribe(): void {}
  request(_op: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    this.reads.push(args);
    if (this.reply === undefined) return new Promise(() => {});
    return Promise.resolve(this.reply(args));
  }
}

/** `at` から始まる n 行を 1 つの追記として渡す。 */
function appendLines(view: TranscriptView, at: number, count: number, from: number): number {
  const lines = Array.from({ length: count }, (_, i) => line(from + i));
  const end = at + count * LINE_BYTES;
  view.take({ sid: SID, size: end, lines, start: at, end });
  return end;
}

describe("窓の大きさ", () => {
  test("追記が続いても窓は 1 MiB 前後で頭打ちになり、先頭が落ちる", () => {
    const port = new SilentPort();
    const view = new TranscriptView(port, SID);
    view.take({ sid: SID, size: 0 });

    let at = 0;
    // 1 MiB を明確に超えるまで追記する。
    const enough = Math.ceil((3 * 1024 * 1024) / LINE_BYTES);
    for (let n = 0; n < enough; n += 100) at = appendLines(view, at, 100, n);

    const held = view.window.value;
    expect(held.end).toBe(at);
    expect(held.end - held.start).toBeLessThanOrEqual(1024 * 1024);
    // 落ちたのは先頭側だけで、末尾は最後に届いた行のまま。
    expect(held.start).toBeGreaterThan(0);
    expect(held.lines.length * LINE_BYTES).toBe(held.end - held.start);
    // 先頭を持っていないので、遡り読みがまた出来る状態に戻っている。
    expect(view.atBeginning.value).toBe(false);
    // 描画に渡る行も窓と同じだけ。
    expect(view.groups.value.length).toBeGreaterThan(0);
    expect(countEntries(view)).toBe(held.lines.length);
  });

  test("落ちた先は遡り読みで埋め直せる", async () => {
    const port = new SilentPort();
    const view = new TranscriptView(port, SID);
    view.take({ sid: SID, size: 0 });
    let at = 0;
    const enough = Math.ceil((1.5 * 1024 * 1024) / LINE_BYTES);
    for (let n = 0; n < enough; n += 100) at = appendLines(view, at, 100, n);
    const dropped = view.window.value.start;
    expect(dropped).toBeGreaterThan(0);

    // 読み手が上へ遡る。instance は落ちた区間の直前を答える。
    const back = 10 * LINE_BYTES;
    port.reply = (args) => {
      expect(args.before).toBe(dropped);
      const start = dropped - back;
      return {
        sid: SID,
        start,
        end: dropped,
        size: at,
        lines: Array.from({ length: 10 }, (_, i) => line(start / LINE_BYTES + i)),
      };
    };
    await view.readOlder();

    expect(view.window.value.start).toBe(dropped - back);
    expect(view.window.value.end).toBe(at);
    expect(countEntries(view)).toBe(view.window.value.lines.length);
  });
});

describe("冪等な読み", () => {
  test("生で受け取った区間と重なる read が届いても、行は 1 度しか出ない", async () => {
    const port = new SilentPort();
    const view = new TranscriptView(port, SID);
    // 10 行目から生で 3 行受け取っている所へ、その 3 行を含む read が返る。
    const live = 10 * LINE_BYTES;
    const end = live + 3 * LINE_BYTES;
    // 購読の snapshot が誘う 1 回目の読みは、まだ何も無い所を答える。
    port.reply = (args) =>
      args.before === undefined
        ? { sid: SID, start: live, end: live, size: live, lines: [] }
        : {
            sid: SID,
            start: live - 2 * LINE_BYTES,
            end,
            size: end,
            lines: [line(8), line(9), line(10), line(11), line(12)],
          };
    view.take({ sid: SID, size: live });
    await Promise.resolve();
    appendLines(view, live, 3, 10);
    await view.readOlder();

    const held = view.window.value;
    expect(held.start).toBe(live - 2 * LINE_BYTES);
    expect(held.end).toBe(end);
    expect(held.lines).toEqual([line(8), line(9), line(10), line(11), line(12)]);
    // 行の byte 位置は狂いなく 1 つずつ進む (= 同じ行が 2 つの位置に出ない)。
    const offsets = entryOffsets(view);
    expect(offsets).toEqual(Array.from({ length: 5 }, (_, i) => held.start + i * LINE_BYTES));
    expect(new Set(offsets).size).toBe(offsets.length);
  });
});

function entryOffsets(view: TranscriptView): number[] {
  const offsets: number[] = [];
  for (const group of view.groups.value) {
    if (group.kind === "entry") offsets.push(group.offset);
    else for (const entry of group.entries) offsets.push(entry.offset);
  }
  return offsets;
}

function countEntries(view: TranscriptView): number {
  return entryOffsets(view).length;
}
