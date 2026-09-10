import { computed, signal } from "@preact/signals";
import type { Sid, TopicName, TranscriptReadResult } from "@ccmsg/protocol";
import { AppendFold, type AppendWindow } from "../topic-fold.ts";
import { crossLineIncrementally, emptyCrossLineCache } from "./incremental-cross-line.ts";
import { emptyLineMapCache, mapLinesIncrementally } from "./incremental-line-map.ts";
import {
  parseTranscriptLine,
  type ParsedLine,
  type TimelineGroup,
  utf8ByteLength,
} from "./transcript-model.ts";

/** One session's transcript as the screen holds it: the lines that have been
 * taken so far, and what they mean once the model layer has read them.
 *
 * The two ways a transcript arrives are the same thing said twice — the topic
 * carries what is appended from the moment of subscription, and `transcript_read`
 * answers what came before — so both are given to one `AppendFold`, which is
 * where the offsets that join them are reasoned about. Everything above that is
 * the pure model layer, memoized so a live append re-parses the appended lines
 * and nothing else. */

/** What this view needs of a connection: it neither opens one nor knows when
 * one drops, so a screen can be driven by a stub in a test. */
export interface TranscriptPort {
  subscribe(topic: TopicName): void;
  unsubscribe(topic: TopicName): void;
  request(op: string, args?: Record<string, unknown>): Promise<Record<string, unknown>>;
}

/** How much of a transcript one read asks for. The instance narrows this to its
 * own limit, so it is a wish rather than a promise. */
const PAGE_BYTES = 256 * 1024;

/** How much of a transcript one screen holds while the tail keeps arriving.
 *
 * The same 1 MiB the instance seeds its own fold of a transcript with, which is
 * what makes the two say the same thing: what a screen holds without asking is
 * what an instance offers without being asked. Older than that is not lost —
 * `transcript_read` pages it back, 256 KiB at a time, and the fold stitches it
 * onto the start of the window. */
const WINDOW_BYTES = 1024 * 1024;

const EMPTY: AppendWindow = { start: 0, end: 0, lines: [] };

export class TranscriptView {
  readonly #port: TranscriptPort;
  readonly #sid: Sid;
  readonly #topic: TopicName;
  #fold: AppendFold;
  #lineCache = emptyLineMapCache<ParsedLine>();
  #lengthCache = emptyLineMapCache<number>();
  #crossCache = emptyCrossLineCache();
  #reading = false;
  #closed = false;

  readonly window = signal<AppendWindow>(EMPTY);
  /** Whether a read is in flight, so the screen can say so rather than looking
   * like a transcript that ends there. */
  readonly loading = signal(false);
  /** Whether the transcript's beginning is held: what says there is nothing
   * older left to ask for. */
  readonly atBeginning = signal(false);
  readonly failure = signal<string | undefined>(undefined);

  /** The whole of the model layer's reading of what is held, recomputed only
   * for the lines an update actually changed. */
  readonly groups = computed<readonly TimelineGroup[]>(() => this.#derive(this.window.value));

  constructor(port: TranscriptPort, sid: Sid) {
    this.#port = port;
    this.#sid = sid;
    this.#topic = `transcript:${sid}`;
    this.#fold = new AppendFold(this.#topic, WINDOW_BYTES);
  }

  get sid(): Sid {
    return this.#sid;
  }

  get topic(): TopicName {
    return this.#topic;
  }

  /** Subscribe first, then read: what is appended between the two arrives on
   * the topic and is stitched on by offset, where reading first would leave a
   * hole nothing later fills.
   *
   * The first page is asked for here, on the snapshot, and whenever the
   * connection settles, because any of the three can be the first moment there
   * is something to ask over: the screen is opened before the greeting on a
   * reload, and an instance that is not following this session's transcript
   * sends no snapshot at all. Asking is idempotent — a read is skipped while
   * one is in flight or a page is already held — so the three cost one read.
   *
   * Reading backwards stays necessary whatever an instance sends: it is how a
   * transcript is paged from its end. Only the *first* of these three moments
   * is there because a snapshot may never arrive, so an instance that comes to
   * state one for every subscription costs nothing here beyond a moment that
   * finds the page already held. */
  open(): void {
    this.#port.subscribe(this.#topic);
    this.ensureFirstPage();
  }

  /** Read the tail, unless it is already held or already being read. */
  ensureFirstPage(): void {
    if (this.#reading || this.#closed || this.#fold.window.lines.length > 0) return;
    void this.readOlder();
  }

  close(): void {
    this.#closed = true;
    this.#port.unsubscribe(this.#topic);
  }

  /** Take one `transcript:<sid>` frame. The snapshot says only where the file
   * ends now, which is where the first read of the tail lands. */
  take(data: { sid: Sid; size: number; lines?: readonly string[]; start?: number; end?: number }) {
    if (data.sid !== this.#sid) return;
    if (data.lines === undefined || data.start === undefined || data.end === undefined) {
      this.window.value = this.#fold.begin(data.size);
      this.atBeginning.value = this.#fold.atBeginning;
      this.ensureFirstPage();
      return;
    }
    try {
      this.window.value = this.#fold.append(
        { lines: data.lines, start: data.start, end: data.end },
        data.size,
      );
      // An append can push the beginning out of the window, and then there is
      // something older to ask for again.
      this.atBeginning.value = this.#fold.atBeginning;
    } catch (cause) {
      // A gap means frames were missed while nothing was reading, and the file
      // is the authority on what is in it: read the tail again from scratch.
      this.#restart(String(cause));
    }
  }

  /** Ask for the page before what is held. Called when a person scrolls up to
   * the top of what has been taken, and once when the subscription opens. */
  async readOlder(): Promise<void> {
    if (this.#reading || this.#closed || this.#fold.atBeginning) return;
    this.#reading = true;
    this.loading.value = true;
    try {
      const held = this.#fold.window;
      const reply = (await this.#port.request("transcript_read", {
        sid: this.#sid,
        max_bytes: PAGE_BYTES,
        // Absent means "from the end", which is what the first read wants: the
        // window is still the empty point the snapshot pinned.
        ...(held.lines.length === 0 ? {} : { before: held.start }),
      })) as unknown as TranscriptReadResult;
      if (this.#closed) return;
      this.window.value = this.#fold.prepend(reply, reply.size);
      this.atBeginning.value = this.#fold.atBeginning;
      this.failure.value = undefined;
    } catch (cause) {
      this.failure.value = String(cause);
    } finally {
      this.#reading = false;
      this.loading.value = false;
    }
  }

  /** Start over: a fresh fold, nothing held, and the subscription taken out and
   * put back so the instance states again where the file ends.
   *
   * The fold is new rather than emptied, which is what leaves the window
   * sitting nowhere: whatever arrives next places it, so the same gap cannot be
   * refused twice. What this costs is not paid here — an instance drops a
   * transcript's tail when the last subscriber leaves and reads the file from
   * scratch when one returns — so a limit on how often this may run belongs
   * with what the instance is being asked to do, not with what the screen
   * looks like. */
  #restart(reason: string): void {
    this.failure.value = reason;
    this.#fold = new AppendFold(this.#topic, WINDOW_BYTES);
    this.#lineCache = emptyLineMapCache<ParsedLine>();
    this.#lengthCache = emptyLineMapCache<number>();
    this.#crossCache = emptyCrossLineCache();
    this.window.value = EMPTY;
    this.atBeginning.value = false;
    this.#port.unsubscribe(this.#topic);
    this.#port.subscribe(this.#topic);
    void this.readOlder();
  }

  #derive(held: AppendWindow): readonly TimelineGroup[] {
    this.#lineCache = mapLinesIncrementally(this.#lineCache, held.lines, parseTranscriptLine);
    this.#lengthCache = mapLinesIncrementally(this.#lengthCache, held.lines, utf8ByteLength);
    this.#crossCache = crossLineIncrementally(this.#crossCache, {
      start: held.start,
      raws: held.lines,
      perLine: this.#lineCache.values,
      byteLengths: this.#lengthCache.values,
    });
    return this.#crossCache.groups;
  }
}
