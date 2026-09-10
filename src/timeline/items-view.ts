import { computed, signal } from "@preact/signals";
import type {
  Sid,
  TopicName,
  TranscriptItem,
  TranscriptItemsReadResult,
  TranscriptReadResult,
} from "@ccmsg/protocol";
import { buildTimeline, recordRange, type TimelineNode } from "./items.ts";

/** One session's transcript as the screen holds it: the items an instance read
 * it into, and the raw records fetched behind the ones a person opened.
 *
 * The classifying happens where the file is — what travels here is the item —
 * so nothing in this layer knows how a record is shaped. The two ways items
 * arrive say the same thing: `transcript_items:<sid>` carries what has been
 * classified since the subscription opened, and `transcript_items_read`
 * answers what came before.
 *
 * The raw record stays reachable all the same: an item carries the address of
 * the line it was read from, and `transcript_read` bounded to that address
 * answers the line itself. That is the one question an item cannot answer —
 * what the record actually said — so it is fetched when someone asks it,
 * rather than held for every item on the chance they do. */

/** What this view needs of a connection: it neither opens one nor knows when
 * one drops, so a screen can be driven by a stub in a test. */
export interface TranscriptPort {
  subscribe(topic: TopicName): void;
  unsubscribe(topic: TopicName): void;
  request(op: string, args?: Record<string, unknown>): Promise<Record<string, unknown>>;
}

/** How many items one read asks for. The instance narrows this to its own
 * limit, so it is a wish rather than a promise. */
const PAGE_ITEMS = 200;

/** How much of a transcript one screen holds while the tail keeps arriving.
 *
 * The same megabyte the instance seeds its own reading with, counted in what
 * the items themselves weigh: a screen holds what an instance offers without
 * being asked. Older than that is not lost — `transcript_items_read` pages it
 * back and it is stitched onto the start of what is held. */
const WINDOW_BYTES = 1024 * 1024;

/** Never hold fewer than the opening frame carries, whatever they weigh: a
 * window that dropped what it was just given would ask for it again forever. */
const WINDOW_FLOOR = 200;

/** One record as the file has it, once someone asked to see it. */
export interface RawRecord {
  readonly state: "loading" | "held" | "failed";
  readonly text: string;
}

interface Held {
  readonly item: TranscriptItem;
  readonly bytes: number;
}

export class TranscriptItemsView {
  readonly #port: TranscriptPort;
  readonly #sid: Sid;
  readonly #topic: TopicName;
  #held: readonly Held[] = [];
  #ids = new Set<string>();
  #reading = false;
  #closed = false;

  readonly items = signal<readonly TranscriptItem[]>([]);
  /** Whether a read is in flight, so the screen can say so rather than looking
   * like a transcript that ends there. */
  readonly loading = signal(false);
  /** Whether the transcript's beginning is held: what says there is nothing
   * older left to ask for. */
  readonly atBeginning = signal(false);
  readonly failure = signal<string | undefined>(undefined);
  /** What a read could not reach. An instance answers a bounded range from its
   * start, so a range wider than one page leaves items between what came back
   * and what is held; saying so is what keeps the timeline from reading as if
   * they were adjacent. */
  readonly gap = signal<string | undefined>(undefined);
  readonly records = signal<ReadonlyMap<string, RawRecord>>(new Map());

  readonly groups = computed<readonly TimelineNode[]>(() => buildTimeline(this.items.value));

  constructor(port: TranscriptPort, sid: Sid) {
    this.#port = port;
    this.#sid = sid;
    this.#topic = `transcript_items:${sid}`;
  }

  get sid(): Sid {
    return this.#sid;
  }

  get topic(): TopicName {
    return this.#topic;
  }

  /** The ids held now, which is what says whose fold state is still about
   * something on the screen. */
  get heldIds(): ReadonlySet<string> {
    return this.#ids;
  }

  /** Subscribe first, then read: what is classified between the two arrives on
   * the topic, and an item already held is recognised by its id rather than
   * counted twice.
   *
   * The first page is asked for here and whenever the connection settles,
   * because either can be the first moment there is something to ask over.
   * Asking is idempotent — a read is skipped while one is in flight or items
   * are already held — so the two cost one read. */
  open(): void {
    this.#port.subscribe(this.#topic);
    this.ensureFirstPage();
  }

  ensureFirstPage(): void {
    if (this.#reading || this.#closed || this.#held.length > 0) return;
    void this.readOlder();
  }

  close(): void {
    this.#closed = true;
    this.#port.unsubscribe(this.#topic);
  }

  /** Take one `transcript_items:<sid>` frame: the tail the subscription opens
   * with, or what has since been classified. Both are appended by the same
   * rule, because both are items that come after what is held. */
  take(data: { sid: Sid; items?: readonly TranscriptItem[] }): void {
    if (data.sid !== this.#sid || data.items === undefined) return;
    this.#append(data.items);
  }

  /** Ask for the items before the ones held. Called when a person scrolls up
   * to the top of what has been taken, and once when the subscription opens. */
  async readOlder(): Promise<void> {
    if (this.#reading || this.#closed || this.atBeginning.value) return;
    this.#reading = true;
    this.loading.value = true;
    try {
      const oldest = this.#held[0]?.item;
      const reply = (await this.#port.request("transcript_items_read", {
        sid: this.#sid,
        limit: PAGE_ITEMS,
        // Absent means the whole transcript, which is what the first read
        // wants: nothing is held to read back from yet.
        ...(oldest === undefined ? {} : { until_uuid: oldest.uuid }),
      })) as unknown as TranscriptItemsReadResult;
      if (this.#closed) return;
      this.#prepend(reply.items, reply.next, oldest);
      this.failure.value = undefined;
    } catch (cause) {
      this.failure.value = String(cause);
    } finally {
      this.#reading = false;
      this.loading.value = false;
    }
  }

  /** The record one item was read from, fetched once per record: several items
   * read out of one line share its address, so opening any of them answers the
   * same line. */
  async readRecord(item: TranscriptItem): Promise<void> {
    const uuid = item.uuid;
    if (this.records.value.get(uuid) !== undefined) return;
    this.#record(uuid, { state: "loading", text: "" });
    try {
      const reply = (await this.#port.request("transcript_read", {
        sid: this.#sid,
        ...recordRange(item),
      })) as unknown as TranscriptReadResult;
      if (this.#closed) return;
      const line = reply.lines[reply.lines.length - 1];
      this.#record(uuid, { state: "held", text: line === undefined ? "" : pretty(line) });
    } catch (cause) {
      this.#record(uuid, { state: "failed", text: String(cause) });
    }
  }

  #record(uuid: string, held: RawRecord): void {
    const next = new Map(this.records.value);
    next.set(uuid, held);
    this.records.value = next;
  }

  #append(items: readonly TranscriptItem[]): void {
    const fresh = items.filter((item) => !this.#ids.has(item.id));
    if (fresh.length === 0) return;
    for (const item of fresh) this.#ids.add(item.id);
    this.#held = [...this.#held, ...fresh.map(weigh)];
    this.#letGoOfTheOldest();
    this.#publish();
  }

  #prepend(
    items: readonly TranscriptItem[],
    next: string | undefined,
    oldest: TranscriptItem | undefined,
  ): void {
    const fresh = items.filter((item) => !this.#ids.has(item.id));
    // An answer that reached what is held is an answer that reached back as
    // far as there is: the range asked for began at the transcript's start.
    const whole = next === undefined || (oldest !== undefined && next === oldest.id);
    this.gap.value = whole
      ? undefined
      : "この間に、まだ読めていない item があります (instance は範囲の古い側から答えます)";
    if (fresh.length === 0) {
      this.atBeginning.value = true;
      return;
    }
    for (const item of fresh) this.#ids.add(item.id);
    this.#held = [...fresh.map(weigh), ...this.#held];
    this.atBeginning.value = whole && fresh.length < PAGE_ITEMS;
    this.#publish();
  }

  /** Let go of the oldest items until what is held is within its bound. The
   * bound is applied where the window grows at its end, so a page someone
   * asked for is not taken back out from under them by the read that fetched
   * it. */
  #letGoOfTheOldest(): void {
    let weight = 0;
    for (const one of this.#held) weight += one.bytes;
    let dropped = 0;
    while (this.#held.length - dropped > WINDOW_FLOOR && weight > WINDOW_BYTES) {
      weight -= (this.#held[dropped] as Held).bytes;
      dropped += 1;
    }
    if (dropped === 0) return;
    for (const one of this.#held.slice(0, dropped)) this.#ids.delete(one.item.id);
    this.#held = this.#held.slice(dropped);
    // What is no longer held may have older items in front of it again.
    this.atBeginning.value = false;
  }

  #publish(): void {
    this.items.value = this.#held.map((one) => one.item);
  }
}

function weigh(item: TranscriptItem): Held {
  return { item, bytes: JSON.stringify(item).length };
}

/** A record as a person reads it: the file writes one line, and what is worth
 * looking at is its shape. A line that is not JSON is shown as it is — that it
 * could not be parsed is itself what the reader came to see. */
function pretty(line: string): string {
  try {
    return JSON.stringify(JSON.parse(line), null, 2);
  } catch {
    return line;
  }
}
