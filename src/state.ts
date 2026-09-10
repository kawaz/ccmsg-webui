import { computed, effect, signal } from "@preact/signals";
import type { Static } from "@sinclair/typebox";
import type {
  AgentInfo,
  AgentsFrame,
  HelloResult,
  LastLiveSession,
  MessageSendResult,
  Notification,
  PeerInfo,
  PeersFrame,
  SessionErrorEntry,
  SessionErrorsFrame,
  Sid,
  TopicName,
} from "@ccmsg/protocol";
import { AuthError, assertPasskey, refreshSession, registerPasskey } from "./auth/client.ts";
import { endpointFromLocation, socketUrl } from "./auth/endpoint.ts";
import { parseRegisterFragment, type Registration } from "./auth/register-link.ts";
import {
  access,
  authProblem,
  connectionExpiresAt,
  describeAuthError,
  forgetSession,
  holdSession,
  needsSignIn,
  tokenIsLive,
} from "./auth/session.ts";
import { type ConnectionStatus, Connection } from "./connection.ts";
import { type FilesMemory, FilesView } from "./files/files-view.ts";
import {
  type FilesRecord,
  filesStorageKey,
  formatFilesRecord,
  parseFilesRecord,
} from "./files/files-store.ts";
import { type HeldMessage, heldFromSend } from "./conversation/held-messages.ts";
import { oversizeReason } from "./frame-limit.ts";
import { parseRoute, type Route, routePath } from "./route.ts";
import { localStore } from "./settings.ts";
import {
  errorsBySid,
  isSortKey,
  type SortKey,
  sortAgents,
  sortLastLive,
  sortPeers,
} from "./sessions.ts";
import { FoldOpen } from "./timeline/fold-open.ts";
import {
  defaultTimelineAutoOpen,
  parseTimelineAutoOpenSettings,
  type TimelineAutoOpenSettings,
  timelineAutoOpenStorageKey,
  toggleTimelineAutoOpen,
} from "./timeline/timeline-auto-open.ts";
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

/** The topics this build stands on: what the session list is made of, plus the
 * one topic that is about the person rather than about a session — a
 * notification is a line a session wrote for whoever is watching. */
const TOPICS: readonly TopicName[] = ["peers", "agents", "session_errors", "notify"];

/** The instance this page belongs to: the base URL it was served from.
 *
 * Read once and never set. It is not a preference — a passkey answers only for
 * the domain this page came from and the refresh cookie only travels to the
 * prefix it was set for, so an endpoint other than this one is an instance this
 * browser cannot authenticate to (DR-0001 §2.3). */
export const endpoint: string | undefined = endpointFromLocation(
  location.origin,
  import.meta.env.BASE_URL,
);

/** The registration a link carried, while it is being completed.
 *
 * Read once, from the fragment: it is the whole of what `passkey add` handed
 * over, and the six digits that go with it arrive by the other route (the
 * person's eyes, from a terminal). */
export const registration = signal<Registration | undefined>(parseRegisterFragment(location.hash));
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
export const route = signal<Route>(parseRoute(location.pathname, location.search));

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

/** One notification as this page holds it: the contract's frame plus a key of
 * this page's own, since two notifications are told apart by nothing on the
 * wire (a notification is an event, not a record — the contract keeps none). */
export interface HeldNotification {
  readonly key: number;
  readonly notification: Notification;
}

/** Notifications that arrived while this page has been open.
 *
 * Held in memory and nowhere else: the contract says a notification matters
 * when it happens, and the session's own transcript is where its answer is
 * written down. What is here is the moment before the transcript catches up. */
export const notifications = signal<readonly HeldNotification[]>([]);

/** 直近の通知だけを、どの画面を見ていても気づけるように出す。読んだら消す
 * (消しても transcript 側には残る)。 */
export const toast = signal<HeldNotification | undefined>(undefined);

export function dismissToast(): void {
  toast.value = undefined;
}

/** How many notifications are worth keeping in view. Beyond it the oldest go:
 * an unread pile is not what this is for. */
const NOTIFICATION_LIMIT = 50;

let notificationCounter = 0;

/** Which kinds of fold open by themselves, and the open/closed state of each
 * individual fold in the timeline being read.
 *
 * The settings are the *default* every fold falls back to, so changing them
 * takes effect by dropping what the reader had overridden rather than by
 * rewriting each fold — which is also what lets a fold nobody has touched
 * follow the settings without the store knowing what its default is. */
export const timelineAutoOpen = signal<TimelineAutoOpenSettings>(defaultTimelineAutoOpen(false));
export const timelineFolds = signal(new FoldOpen());

/** Where one session's auto-open settings are kept.
 *
 * A session id names a session on one instance, and a browser reaches several
 * instances from the one store, so what is kept per session is keyed by both.
 * Nothing is stored until an instance has answered — before that there is no
 * name to key on, and the defaults are what a first look at a session gets. */
function autoOpenKey(): string | undefined {
  const instance = hello.value?.instance;
  const at = route.value;
  if (instance === undefined || at.at !== "session") return undefined;
  return timelineAutoOpenStorageKey(instance, at.sid, undefined);
}

export function toggleTimelineAutoOpenSetting(key: keyof TimelineAutoOpenSettings): void {
  const next = toggleTimelineAutoOpen(timelineAutoOpen.value, key);
  timelineAutoOpen.value = next;
  // Every fold goes back to its own default, which is what the new settings
  // just changed. What the reader opened by hand was an answer to the old
  // defaults, so it is not carried over.
  timelineFolds.value.reset();
  const key_ = autoOpenKey();
  if (key_ !== undefined) localStore.set(key_, JSON.stringify(next));
}

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
    if (next === "open") {
      transcript.peek()?.ensureFirstPage();
      files.peek()?.start();
    }
    // What an instance said stops being current the moment it stops speaking,
    // so a dropped connection empties the lists rather than leaving them to be
    // read as live.
    if (next === "closed" || next === "idle") {
      peerSlots.value = [];
      agentSlots.value = [];
      errorSlots.value = [];
      hello.value = undefined;
      // 期限は「この接続がいつまで許されているか」なので、接続と一緒に消える。
      // access token 自体はまだ生きているかもしれないので手を付けない。
      connectionExpiresAt.value = undefined;
      // 通知は「今それが起きた」という知らせなので、話し相手が居なくなった
      // 時点で古い。畳まずに捨てる。
      notifications.value = [];
      toast.value = undefined;
      // 待っている 1 通は「この接続で送った」という控えなので、話し相手が
      // 居なくなったら根拠ごと消える。
      heldMessages.value = [];
      // 木もファイル本文も「聞いた時点の写し」なので、話し相手が居なくなったら
      // 次に繋がった時に取り直す (捨てはしない — 読んでいた画面が空になるより、
      // 古いと分かる形で残る方がよい)。
      files.peek()?.dropped();
    }
  },
  greeted(result) {
    hello.value = result;
    // The connection's own deadline, which is what is renewed on it. Absent
    // where reaching the instance is itself the permission, and then there is
    // nothing to renew.
    connectionExpiresAt.value = result.auth_expires_at;
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
      case "notify": {
        notificationCounter += 1;
        const held: HeldNotification = {
          key: notificationCounter,
          notification: message.data as Notification,
        };
        notifications.value = [...notifications.value, held].slice(-NOTIFICATION_LIMIT);
        toast.value = held;
        break;
      }
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
  // A fold's state is about the transcript being read, so moving to another
  // session starts from that session's own settings and no held overrides.
  timelineFolds.value = new FoldOpen();
  transcript.value = view;
  view.open();
});

/** The files tab's state for the session the URL names, or nothing when the URL
 * names another tab. Made and dropped by the same rule the transcript is. */
export const files = signal<FilesView | undefined>(undefined);

/** How one session's files record is read and written.
 *
 * The key names the instance, so nothing is stored before it has greeted: a
 * session id alone names a session on no particular instance, and a record
 * written under a guess would be read back for the wrong one. */
export function filesMemory(sid: Sid): FilesMemory {
  const key = (): string | undefined => {
    const instance = hello.value?.instance;
    return instance === undefined ? undefined : filesStorageKey(instance, sid);
  };
  return {
    read(): FilesRecord {
      const at = key();
      return at === undefined ? {} : parseFilesRecord(localStore.get(at));
    },
    write(record: FilesRecord): void {
      const at = key();
      if (at !== undefined) localStore.set(at, formatFilesRecord(record));
    },
  };
}

effect(() => {
  const at = route.value;
  const wanted = at.at === "session" && at.tab === "files" ? at.sid : undefined;
  const held = files.peek();
  if (held?.sid !== wanted) {
    files.value =
      wanted === undefined ? undefined : new FilesView(connection, wanted, filesMemory(wanted));
    if (wanted !== undefined && status.peek() === "open") files.peek()?.start();
  }
  if (at.at !== "session" || at.tab !== "files") return;
  files.peek()?.show(at.path);
});

// Entering the files tab without a file named opens the one that was open
// last, and says so in the URL — what is on screen and what the address bar
// says are the same thing everywhere else in this app, and a restored file is
// no exception. Nothing happens before the instance has greeted: that is when
// there is a key to read the record under.
effect(() => {
  const at = route.value;
  const instance = hello.value?.instance;
  if (at.at !== "session" || at.tab !== "files" || at.path !== undefined) return;
  if (instance === undefined) return;
  const stored = filesMemory(at.sid).read().path;
  if (stored !== undefined) navigate({ ...at, path: stored }, { replace: true });
});

/** Where one session works, as the instance last said. What resolves a path
 * written in a transcript into the path this build opens. */
export function sessionPaths(sid: Sid): { cwd?: string; root?: string } {
  const peer = peers.value.find((one) => one.sid === sid);
  if (peer === undefined) return {};
  return { cwd: peer.cwd, ...(peer.repo_root === undefined ? {} : { root: peer.repo_root }) };
}

// The settings a session was last read with, once there is an instance to key
// them on. Read rather than written here: a look at a session neither creates
// nor migrates a stored value.
effect(() => {
  const key = autoOpenKey();
  const fallback = defaultTimelineAutoOpen(false);
  timelineAutoOpen.value =
    key === undefined
      ? fallback
      : parseTimelineAutoOpenSettings(localStore.get(key) ?? null, fallback);
  timelineFolds.peek().reset();
});

/** The access token to open the next socket with.
 *
 * Asked for on every attempt, so a reconnection on the far side of a token's
 * life renews rather than fails: what is held in memory is presented while it
 * lasts, and the refresh cookie is what answers when it does not. Nothing to
 * present raises the sign-in screen, which is the only way back. */
async function accessToken(): Promise<string | undefined> {
  if (tokenIsLive()) return access.peek()?.value;
  if (endpoint === undefined) return undefined;
  try {
    holdSession(await refreshSession(endpoint));
    return access.peek()?.value;
  } catch (cause) {
    forgetSession();
    needsSignIn.value = true;
    // A first visit has no cookie, and being told so reads as a failure of
    // something the person did. Only a refusal that is not simply "no session
    // here" is worth saying out loud.
    if (!(cause instanceof AuthError) || (cause.code !== "auth_invalid" && cause.status !== 401)) {
      authProblem.value = describeAuthError(cause);
    }
    return undefined;
  }
}

/** Open the socket under this page's endpoint and subscribe to what the list
 * needs. */
export function connect(): void {
  if (endpoint === undefined) return;
  generationWarning.value = undefined;
  connection.connect(socketUrl(endpoint), accessToken);
  for (const topic of TOPICS) connection.subscribe(topic);
}

export function disconnect(): void {
  connection.close();
}

/** Prove a passkey and connect on what it minted.
 *
 * No relying party is named: a passkey answers for the domain of the page
 * asking, which is the endpoint's own host — the one it was registered under
 * (DR-0001 §2.3). */
export async function signIn(): Promise<void> {
  if (endpoint === undefined) return;
  authProblem.value = undefined;
  try {
    holdSession(await assertPasskey(endpoint));
    connect();
  } catch (cause) {
    authProblem.value = describeAuthError(cause);
  }
}

/** Finish what a registration link started: make the passkey, spend the link
 * with the digits from the terminal, and connect on the session it answers. */
export async function completeRegistration(code: string, deviceLabel: string): Promise<void> {
  const held = registration.peek();
  if (held === undefined) return;
  authProblem.value = undefined;
  try {
    const session = await registerPasskey({
      token: held.token,
      claims: held.claims,
      code,
      deviceLabel,
    });
    holdSession(session);
    registration.value = undefined;
    connect();
  } catch (cause) {
    authProblem.value = describeAuthError(cause);
  }
}

/** Leave the registration screen without registering. What the link authorized
 * is untouched — it is spent by registering and by nothing else. */
export function dismissRegistration(): void {
  registration.value = undefined;
  authProblem.value = undefined;
  connect();
}

/** How much of a connection's remaining life to use before renewing it. The
 * renewal is two round trips (a token, then the op that moves the deadline),
 * and a tenth of a few hours is minutes of room for them. */
const RENEW_AT_FRACTION = 0.9;
const RENEW_FLOOR_MS = 5_000;

let renewTimer: ReturnType<typeof setTimeout> | undefined;

/** Move this connection's deadline before it arrives.
 *
 * Two steps because they answer different questions: `/auth/refresh` mints a
 * token from the cookie, and `auth_refresh` on this very connection moves its
 * deadline — a client that reconnected to use a fresh token would blink every
 * few hours for no reason (DR-0001 §2.5). */
async function renewConnection(): Promise<void> {
  if (endpoint === undefined || status.peek() !== "open") return;
  try {
    holdSession(await refreshSession(endpoint));
    const token = access.peek()?.value;
    if (token === undefined) return;
    const reply = await connection.request("auth_refresh", { access_token: token });
    const next = (reply as { auth_expires_at?: number }).auth_expires_at;
    if (typeof next === "number") connectionExpiresAt.value = next;
  } catch {
    // Nothing to do here: the instance closes the connection at its deadline,
    // and the reconnection is where authenticating again is decided.
  }
}

// The deadline is a thing the instance said, so renewing is scheduled off what
// it said rather than off when this page last did anything.
effect(() => {
  const at = connectionExpiresAt.value;
  if (renewTimer !== undefined) clearTimeout(renewTimer);
  renewTimer = undefined;
  if (at === undefined) return;
  const wait = Math.max(RENEW_FLOOR_MS, (at - Date.now()) * RENEW_AT_FRACTION);
  renewTimer = setTimeout(() => {
    void renewConnection();
  }, wait);
});

export function setSortKey(key: SortKey): void {
  sortKey.value = key;
  localStore.set(SORT_KEY_STORAGE, key);
}

function loadSortKey(): SortKey {
  const held = localStore.get(SORT_KEY_STORAGE);
  return held !== undefined && isSortKey(held) ? held : "user_input";
}

/** Move to another place in the app.
 *
 * `replace` is for a move the person did not ask for — restoring the file that
 * was open when the tab is entered without one named — so the back button does
 * not have to walk through the app's own bookkeeping. */
export function navigate(next: Route, options?: { replace?: boolean }): void {
  route.value = next;
  const path = routePath(next);
  if (options?.replace === true) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
}

export function adoptLocation(): void {
  route.value = parseRoute(location.pathname, location.search);
}

/** 人からセッションへ 1 通送る。
 *
 * 宛先は sid ひとつ。返ってくるのは「今届いたか、inbox に積まれたか」で、
 * どちらも成功なので、呼ぶ側は結果を読んで人に見せる (`describeSendOutcome`)。 */
/** この 1 通を送れない理由。送れるなら undefined。
 *
 * 契約の上限は送る側が守るものなので、断られてから読ませるのではなく、
 * これから送る行そのものを測って先に言う。 */
export function messageSendRefusal(sid: Sid, text: string): string | undefined {
  return oversizeReason(connection.frameBytes("message_send", { to: sid, text }));
}

export async function sendMessage(sid: Sid, text: string): Promise<MessageSendResult> {
  const reply = await connection.request("message_send", { to: sid, text });
  const result = reply as unknown as MessageSendResult;
  const waiting = heldFromSend(sid, text, result);
  if (waiting !== undefined) heldMessages.value = [...heldMessages.value, waiting];
  return result;
}

/** この画面から送って、相手にまだ渡っていない 1 通たち。
 *
 * ページのメモリにだけ置く。instance に問い合わせて確かめる術が無い以上
 * (`held-messages.ts` を読む)、書き留めて残せば「もう届いているのに残って
 * いる古い控え」を作ることになる。読み込み直したら消える方が正直。 */
export const heldMessages = signal<readonly HeldMessage[]>([]);

/** 1 通を一覧から下ろす。渡ったかどうかは分からないので、下ろすのは人の
 * 判断 (「もう気にしなくてよい」) であって、届いた証拠ではない。 */
export function dropHeld(key: number): void {
  heldMessages.value = heldMessages.value.filter((one) => one.key !== key);
}

/** Drop one entry from the instance's record of sessions that were running.
 *
 * The list is answered by the instance, so nothing is removed here: the next
 * `peers` frame is what shows the removal, which is also what makes two people
 * pressing the same button agree. */
export async function removeLastLive(sid: Sid): Promise<void> {
  await connection.request("session_last_live_remove", { sid });
}
