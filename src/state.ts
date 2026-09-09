import { computed, effect, signal } from "@preact/signals";
import type { Static } from "@sinclair/typebox";
import type {
  AgentInfo,
  AgentsFrame,
  HelloResult,
  LastLiveSession,
  PeerInfo,
  PeersFrame,
  SessionErrorEntry,
  SessionErrorsFrame,
  Sid,
  TopicName,
} from "@ccmsg/protocol";
import { type ConnectionStatus, Connection } from "./connection.ts";
import { parseRoute, type Route, routePath } from "./route.ts";
import { type Entry, completeEntry, loadEntry, localStore, saveEntry } from "./settings.ts";
import {
  errorsBySid,
  isSortKey,
  type SortKey,
  sortAgents,
  sortLastLive,
  sortPeers,
} from "./sessions.ts";
import { TranscriptView } from "./timeline/transcript-view.ts";
import { type Slot, TopicFold, union } from "./topic-fold.ts";

/** The whole of this build's state, and the functions that change it.
 *
 * Signals hold the values and computed signals hold everything derived from
 * them, so a screen reads what it needs and nothing re-renders for a value it
 * does not read. The functions below are the only writers. */

// The payload types come from the contract's own frame schemas rather than
// being restated here, so a field added there is a field this holds.
type PeersData = Static<typeof PeersFrame>["data"];
type AgentsData = Static<typeof AgentsFrame>["data"];
type ErrorsData = Static<typeof SessionErrorsFrame>["data"];

const SORT_KEY_STORAGE = "ccmsg.sessions.sort";

/** The topics the session list stands on. */
const TOPICS: readonly TopicName[] = ["peers", "agents", "session_errors"];

export const entry = signal<Partial<Entry>>(loadEntry(localStore, location.hash));
export const status = signal<ConnectionStatus>("idle");
export const statusDetail = signal<string | undefined>(undefined);
export const hello = signal<HelloResult | undefined>(undefined);
/** Set once the instance and this build disagree about the contract. There is
 * no path back: the page asks for a reload rather than degrading. */
export const generationWarning = signal<string | undefined>(undefined);

const peerSlots = signal<readonly Slot<PeersData>[]>([]);
const agentSlots = signal<readonly Slot<AgentsData>[]>([]);
const errorSlots = signal<readonly Slot<ErrorsData>[]>([]);

export const sortKey = signal<SortKey>(loadSortKey());
export const route = signal<Route>(parseRoute(location.pathname));

export const peers = computed<readonly PeerInfo[]>(() =>
  sortPeers(union(peerSlots.value, "peers"), sortKey.value),
);
export const lastLive = computed<readonly LastLiveSession[]>(() =>
  sortLastLive(union(peerSlots.value, "last_live")),
);
export const agents = computed<readonly AgentInfo[]>(() =>
  sortAgents(union(agentSlots.value, "agents"), union(peerSlots.value, "peers")),
);
export const sessionErrors = computed<ReadonlyMap<Sid, SessionErrorEntry>>(() =>
  errorsBySid(union(errorSlots.value, "errors")),
);

/** The transcript of the session the URL names, or nothing when the URL names
 * no session. One at a time: a screen shows one timeline, and a subscription
 * kept for a session nobody is looking at is a file being tailed for nobody. */
export const transcript = signal<TranscriptView | undefined>(undefined);

const folds = new Map<string, TopicFold<unknown>>();

function fold<T>(topic: string): TopicFold<T> {
  const held = folds.get(topic);
  if (held !== undefined) return held as TopicFold<T>;
  const made = new TopicFold<unknown>(topic);
  folds.set(topic, made);
  return made as TopicFold<T>;
}

export const connection = new Connection({
  status(next, detail) {
    status.value = next;
    statusDetail.value = detail;
    // A settled greeting is the first moment a request can be made, which is
    // what a timeline opened before the connection was waiting for.
    if (next === "open") transcript.peek()?.ensureFirstPage();
    // What an instance said stops being current the moment it stops speaking,
    // so a dropped connection empties the lists rather than leaving them to be
    // read as live.
    if (next === "closed" || next === "idle") {
      peerSlots.value = [];
      agentSlots.value = [];
      errorSlots.value = [];
      hello.value = undefined;
    }
  },
  greeted(result) {
    hello.value = result;
  },
  topic(message) {
    const view = transcript.value;
    if (view !== undefined && message.topic === view.topic) {
      view.take(
        message.data as { sid: Sid; size: number; lines?: string[]; start?: number; end?: number },
      );
      return;
    }
    switch (message.topic) {
      case "peers":
        peerSlots.value = fold<PeersData>("peers").push(
          message.instance,
          message.data as PeersData,
        );
        break;
      case "agents":
        agentSlots.value = fold<AgentsData>("agents").push(
          message.instance,
          message.data as AgentsData,
        );
        break;
      case "session_errors":
        errorSlots.value = fold<ErrorsData>("session_errors").push(
          message.instance,
          message.data as ErrorsData,
        );
        break;
    }
  },
  generationMismatch(reason) {
    generationWarning.value = reason;
  },
});

// Which session's transcript is being followed is decided by the URL and by
// nothing else, so entering, leaving, and moving between sessions are one rule
// rather than three call sites that have to agree.
effect(() => {
  const at = route.value;
  const wanted = at.at === "session" ? at.sid : undefined;
  const held = transcript.peek();
  if (held?.sid === wanted) return;
  held?.close();
  if (wanted === undefined) {
    transcript.value = undefined;
    return;
  }
  const view = new TranscriptView(connection, wanted);
  transcript.value = view;
  view.open();
});

/** Point at an instance, remember it, and subscribe to what the list needs. */
export function connect(next: Entry): void {
  saveEntry(localStore, next);
  entry.value = next;
  generationWarning.value = undefined;
  connection.connect(next);
  for (const topic of TOPICS) connection.subscribe(topic);
}

export function disconnect(): void {
  connection.close();
}

/** Connect with what was already configured, which is what a reload does. */
export function reconnectFromSettings(): void {
  const ready = completeEntry(entry.value);
  if (ready !== undefined) connect(ready);
}

export function setSortKey(key: SortKey): void {
  sortKey.value = key;
  localStore.set(SORT_KEY_STORAGE, key);
}

function loadSortKey(): SortKey {
  const held = localStore.get(SORT_KEY_STORAGE);
  return held !== undefined && isSortKey(held) ? held : "user_input";
}

export function navigate(next: Route): void {
  route.value = next;
  history.pushState(null, "", routePath(next));
}

export function adoptLocation(): void {
  route.value = parseRoute(location.pathname);
}

/** Drop one entry from the instance's record of sessions that were running.
 *
 * The list is answered by the instance, so nothing is removed here: the next
 * `peers` frame is what shows the removal, which is also what makes two people
 * pressing the same button agree. */
export async function removeLastLive(sid: Sid): Promise<void> {
  await connection.request("session_last_live_remove", { sid });
}
