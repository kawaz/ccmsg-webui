// 画面が transcript をどう持つか。届く道は 2 つ (購読と読み込み) だが、持ち方は
// 1 つ — id で数える追記だけ。ここで固定するのは、同じ item を 2 度数えないこと、
// 遡りが繋がっているかを言えること、そして生の record が要求した時だけ取れること。
import { describe, expect, test } from "bun:test";
import type { Sid, TopicName } from "@ccmsg/protocol";
import { TranscriptItemsView } from "../src/timeline/items-view.ts";
import { item } from "./item.ts";

const SID = "11111111-2222-4333-8444-555555555555" as Sid;

class Port {
  readonly subscribed: TopicName[] = [];
  readonly asked: { op: string; args: Record<string, unknown> }[] = [];
  answers: Record<string, unknown>[] = [];

  subscribe(topic: TopicName): void {
    this.subscribed.push(topic);
  }
  unsubscribe(topic: TopicName): void {
    this.subscribed.splice(this.subscribed.indexOf(topic), 1);
  }
  request(op: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    this.asked.push({ op, args });
    const answer = this.answers.shift();
    return answer === undefined
      ? Promise.reject(new Error("答えを用意していません"))
      : Promise.resolve(answer);
  }
}

describe("購読と最初の読み込み", () => {
  test("購読してから読む。先に読むと、その間に分類されたものが誰にも届かない", async () => {
    const port = new Port();
    port.answers = [{ items: [] }];
    const view = new TranscriptItemsView(port, SID);
    view.open();
    expect(port.subscribed).toEqual([`transcript_items:${SID}`]);
    await Promise.resolve();
    expect(port.asked[0]?.op).toBe("transcript_items_read");
    expect(port.asked[0]?.args["until_uuid"]).toBeUndefined();
  });

  test("既に持っているなら読み直さない", async () => {
    const port = new Port();
    const view = new TranscriptItemsView(port, SID);
    view.take({ sid: SID, items: [item("message:user:in", { text: "やって" })] });
    view.ensureFirstPage();
    await Promise.resolve();
    expect(port.asked.length).toBe(0);
  });
});

describe("追記", () => {
  test("同じ item は 2 度数えない (購読と読み込みが重なる所)", () => {
    const port = new Port();
    const view = new TranscriptItemsView(port, SID);
    const one = item("message:user:in", { text: "やって" });
    view.take({ sid: SID, items: [one] });
    view.take({ sid: SID, items: [one, item("message:user:out", { text: "やった" })] });
    expect(view.items.value.length).toBe(2);
  });

  test("別のセッションの frame は取らない", () => {
    const port = new Port();
    const view = new TranscriptItemsView(port, SID);
    view.take({
      sid: "66666666-7777-4888-8999-aaaaaaaaaaaa" as Sid,
      items: [item("thinking", {})],
    });
    expect(view.items.value.length).toBe(0);
  });

  test("窓を超えた分は古い方から手放す", () => {
    const port = new Port();
    const view = new TranscriptItemsView(port, SID);
    const many = Array.from({ length: 400 }, () =>
      item("message:user:out", { text: "あ".repeat(3000) }),
    );
    view.take({ sid: SID, items: many });
    expect(view.items.value.length).toBeLessThan(400);
    expect(view.items.value.length).toBeGreaterThanOrEqual(200);
    // 手放したのは古い方: 末尾は必ず残る。
    expect(view.items.value.at(-1)?.id).toBe(many.at(-1)!.id);
  });
});

describe("遡り", () => {
  test("持っている先頭の record より手前を頼み、前に足す", async () => {
    const port = new Port();
    const view = new TranscriptItemsView(port, SID);
    const held = item("message:user:out", { text: "いま" });
    view.take({ sid: SID, items: [held] });
    const older = item("message:user:in", { text: "むかし" });
    port.answers = [{ items: [older] }];
    await view.readOlder();
    expect(port.asked[0]?.args["until_uuid"]).toBe(held.uuid);
    expect(view.items.value.map((one) => one.id)).toEqual([older.id, held.id]);
    expect(view.atBeginning.value).toBe(true);
    expect(view.gap.value).toBeUndefined();
  });

  test("何も新しく来なければ、そこが先頭", async () => {
    const port = new Port();
    const view = new TranscriptItemsView(port, SID);
    const held = item("message:user:out", { text: "いま" });
    view.take({ sid: SID, items: [held] });
    port.answers = [{ items: [held] }];
    await view.readOlder();
    expect(view.atBeginning.value).toBe(true);
    expect(view.items.value.length).toBe(1);
  });

  test("答えが手元に届いていないなら、その間が空いていると言う", async () => {
    const port = new Port();
    const view = new TranscriptItemsView(port, SID);
    const held = item("message:user:out", { text: "いま" });
    view.take({ sid: SID, items: [held] });
    port.answers = [{ items: [item("message:user:in", { text: "ずっと前" })], next: "別の:0" }];
    await view.readOlder();
    expect(view.gap.value).toBeDefined();
    expect(view.atBeginning.value).toBe(false);
  });

  test("読めなかったら理由を出す", async () => {
    const port = new Port();
    const view = new TranscriptItemsView(port, SID);
    await view.readOlder();
    expect(view.failure.value).toContain("答えを用意していません");
  });
});

describe("生の record", () => {
  test("item が指す 1 行だけを頼み、読める形にして持つ", async () => {
    const port = new Port();
    const view = new TranscriptItemsView(port, SID);
    const one = item("system:unknown", { record: {} }, { offset: 400, bytes: 40 });
    port.answers = [{ lines: [`{"type":"なにか"}`], start: 400, end: 440, size: 440 }];
    await view.readRecord(one);
    expect(port.asked[0]).toEqual({
      op: "transcript_read",
      args: { sid: SID, before: 440, max_bytes: 40 },
    });
    expect(view.records.value.get(one.uuid)?.text).toBe(`{\n  "type": "なにか"\n}`);
  });

  test("同じ record は 1 度しか取り寄せない (1 行から読まれた item は同じ所を指す)", async () => {
    const port = new Port();
    const view = new TranscriptItemsView(port, SID);
    const first = item("thinking", { text: "" }, { uuid: "rec-x", index: 0 });
    const second = item(
      "tool:Bash",
      { role: "use", tool_use_id: "t" },
      { uuid: "rec-x", index: 1 },
    );
    port.answers = [{ lines: ["{}"], start: 0, end: 3, size: 3 }];
    await view.readRecord(first);
    await view.readRecord(second);
    expect(port.asked.length).toBe(1);
  });

  test("読めなかったら、そう出す", async () => {
    const port = new Port();
    const view = new TranscriptItemsView(port, SID);
    const one = item("thinking", { text: "" });
    await view.readRecord(one);
    expect(view.records.value.get(one.uuid)?.state).toBe("failed");
  });
});
