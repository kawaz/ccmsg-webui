import { computed, effect, signal } from "@preact/signals";
import type { Static } from "@sinclair/typebox";
import type {
  AgentElement,
  AgentInfo,
  Capability,
  LlmRequestInfo,
  LlmUsageReadResult,
  AuthAccountReadResult,
  AuthRefreshReason,
  AuthSession,
  AgentsFrame,
  HelloResult,
  InboxElement,
  InboxMessage,
  InstanceInfo,
  InstancesFrame,
  LlmRequestsFrame,
  LlmStatusFrame,
  MessageSendResult,
  Notification,
  PeerElement,
  PeerInfo,
  PeersFrame,
  SessionErrorEntry,
  SessionErrorsFrame,
  LauncherConfigReadResult,
  LlmStatsReadResult,
  LauncherRunArgs,
  LauncherRunResult,
  DumpPresetsReadResult,
  SessionDumpWriteArgs,
  SessionDumpWriteResult,
  SessionKillResult,
  SessionRenameResult,
  SessionSearchArgs,
  SessionSearchResult,
  SessionStatusSnapshot,
  Sid,
  TerminalElement,
  TerminalInfo,
  TerminalsFrame,
  TopicName,
  TranscriptItem,
  TranslateRunResult,
} from "@ccmsg/protocol";
import {
  assertPasskey,
  canOfferPasskey,
  enrolInstance,
  refreshSession,
  registerPasskey,
  signOutSession,
} from "./auth/client.ts";
import { BASE, href, locationRoute } from "./base.ts";
import { endpointFromLocation, isEndpoint, socketUrl } from "./auth/endpoint.ts";
import { type Enrolment, type EnrolmentLink, isRefused } from "./auth/enrolment-link.ts";
import {
  access,
  authProblem,
  connectRefreshReason,
  connectionExpiresAt,
  describeAuthError,
  forgetSession,
  holdSession,
  isNoSession,
  isSignInDeclined,
  isUnreachable,
  needsRegistration,
  needsSignIn,
  tokenIsLive,
  user,
} from "./auth/session.ts";
import { TabShare } from "./auth/tab-share.ts";
import {
  type ConnectionStatus,
  Connection,
  type TokenAnswer,
  type TokenMissing,
} from "./connection.ts";
import { type FilesMemory, FilesView } from "./files/files-view.ts";
import { FileWordIndex } from "./files/file-word-find.ts";
import {
  type FilesRecord,
  filesStorageKey,
  formatFilesRecord,
  parseFilesRecord,
} from "./files/files-store.ts";
import {
  inboxKey,
  rememberDepartures,
  type WaitingMessage,
  waitingCounts,
} from "./conversation/inbox.ts";
import { oversizeReason } from "./frame-limit.ts";
import { isConnected, type Phase, phaseOf } from "./phase.ts";
import { keepsPreferences } from "./signout-keep.ts";
import { describeRefusal } from "./refusal.ts";
import type { Route } from "./route.ts";
import { formatSessionsOpen, parseSessionsOpen, sessionsOpenKey } from "./layout/panes.ts";
import { clearLocal, keepOnSignOut, localStore } from "./settings.ts";
import {
  answeringSids,
  errorsBySid,
  isSortKey,
  type SortKey,
  sortAgents,
  sortPeers,
  terminalIdsBySid,
  waitingForByPid,
} from "./sessions.ts";
import {
  groupTerminals,
  sessionTerminals,
  startingTerminals,
  type TerminalGroup,
  terminalRowKey,
} from "./terminals.ts";
import { FoldOpen } from "./timeline/fold-open.ts";
import type { TranslateRoute } from "./timeline/translate.ts";
import { hasBrowserTranslator } from "./timeline/translators.ts";
import { forgetFoldsOutside } from "./timeline/fold-tree.ts";
import {
  clearDisplay,
  type DisplayAxis,
  type DisplayFace,
  type DisplayFaces,
  type DisplaySettings,
  displayStorageKey,
  formatDisplaySettings,
  parseDisplaySettings,
  setDisplay,
  type Subject,
  SUBJECTS,
} from "./timeline/display.ts";
import { TranscriptItemsView } from "./timeline/items-view.ts";
import { ElementFold, rows, type Slot, TopicFold, union } from "./topic-fold.ts";

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
type InstancesData = Static<typeof InstancesFrame>["data"];
type LlmStatusData = Static<typeof LlmStatusFrame>["data"];
type LlmRequestsData = Static<typeof LlmRequestsFrame>["data"];
type TerminalsData = Static<typeof TerminalsFrame>["data"];

/** 並べ方の好み。instance もセッションも名前に入らない — 一覧を何順で読むかは
 * この人の読み方で、相手ごとに決め直すものではない。 */
const SORT_KEY_STORAGE = keepOnSignOut("ccmsg.sessions.sort");
/** 留めたセッション。**このブラウザの覚え**で、instance には送らない — 「今
 * 追いかけている仕事」は人ごとに違い、同じ instance を見ている他の人の一覧を
 * 動かす理由が無い。
 *
 * 好みとしては残さない (`keepOnSignOut` を通さない): 名前には sid が入らないが、
 * **値が名指しているのは instance のセッション**なので、降りた端末に残せば、
 * 次にそこを使う人の一覧が他人の仕事で始まる。 */
const PINNED_STORAGE = "ccmsg.sessions.pinned";

/** The topics this build stands on: what the session list is made of, plus the
 * one topic that is about the person rather than about a session — a
 * notification is a line a session wrote for whoever is watching. */
const TOPICS: readonly TopicName[] = [
  "peers",
  "instances",
  "agents",
  "session.errors",
  "notify",
  "inbox",
  "terminals",
];

/** 能力を持っている instance にだけ頼む topic。gateway を前に置いていない
 * instance では、この 2 つはそもそも存在しない。 */
const CAPABILITY_TOPICS: readonly (readonly [Capability, TopicName])[] = [
  ["llm_status", "llm.status"],
  ["llm_events", "llm.requests"],
];

/** The instance this page is dialing: a base URL the person states.
 *
 * Not where this page came from. This page is published at an origin of its own
 * and the instance it reaches is named separately — the two are compared with
 * nothing, and a person may open one page at several instances (contract
 * DR-0030).
 * What is offered first is this page's own address, which is right where an
 * instance serves the UI under its own endpoint and is only a starting value
 * anywhere else.
 *
 * Kept between visits, because stating it again on every load is work the
 * person already did (`src/settings.ts`). */
const ENDPOINT_KEY = "ccmsg.endpoint";

function firstEndpoint(): string | undefined {
  const kept = localStore.get(ENDPOINT_KEY);
  if (kept !== undefined && isEndpoint(kept)) return kept;
  return endpointFromLocation(location.origin, BASE);
}

export const endpoint = signal<string | undefined>(firstEndpoint());

/** Dial another instance.
 *
 * Refused unless it is an endpoint at all (contract `Endpoint`): a value this
 * page cannot write routes after is not one to keep. Everything held belongs to
 * the instance it came from, so moving is a disconnection — the session, the
 * lists and what was being read are another instance's and mean nothing here. */
export function setEndpoint(next: string): boolean {
  if (!isEndpoint(next)) return false;
  if (next === endpoint.peek()) {
    // 綴りが同じでも、**覚えることは起きる**。欄に最初から入っているのはこの
    // ページ自身の住所という推測で、同じ文字列を人が述べた (or 登録がそう
    // 名乗った) こととは別のこと — §2.7 が「この端末はもう誰かのものか」を
    // 読むのはこの覚えの有無なので、書かないと、instance が UI ごと配って
    // いる置き方で登録した端末が、いつまでも誰のものでもないままになる。
    localStore.set(ENDPOINT_KEY, next);
    return true;
  }
  disconnect();
  endpoint.value = next;
  localStore.set(ENDPOINT_KEY, next);
  // The other tabs of the instance just left are not this tab's any more, and
  // neither is the token they settled on.
  tabs.moved();
  return true;
}

/** The enrolment a link carried, while it is being carried out.
 *
 * Filled in from the fragment, whenever one arrives: it is the whole of what
 * `ccmsg user create` or `ccmsg user add --enroll` handed over, and the six
 * digits that go with it arrive by the other route (the person's eyes, from a
 * terminal). */
export const enrolment = signal<Enrolment | undefined>(undefined);

/** Take up what an enrolment link brought.
 *
 * The link names the endpoint its answer is posted to, so opening one is the
 * person stating an endpoint — and the field takes that value here rather than
 * after the ceremony. **Nothing is acted on here**: the claims are read without
 * a signature — anyone can write a token and hand somebody the link — so what
 * this page does with them is show them, and the person decides. The endpoint
 * named in them is dialed once the enrolment succeeds, which is the point at
 * which the instance holding the secret has said the link was its own. Leaving
 * the screen leaves this page where it already was.
 *
 * A link that cannot be acted on says so instead. Somebody opened a URL they
 * were handed, and a page that quietly carried on would leave them pressing it
 * again. */
export function holdEnrolment(link: EnrolmentLink): void {
  if (isRefused(link)) {
    authProblem.value = link.refused;
    return;
  }
  enrolment.value = link;
}
export const status = signal<ConnectionStatus>("idle");

/** この画面が instance から一覧を**一度でも**受け取ったか。
 *
 * 「繋がっている」とは別に持つ。socket が開いた瞬間はまだ何も聞いていないので、
 * そこで一覧を出すと**空の一覧**が一度描かれる。空の一覧は「セッションが 1 つも
 * 無い」という嘘で、「繋がっていない」とは違うことを言ってしまう。
 *
 * 切断で false には戻らない。回線が切れただけなら、最後に聞いた行は次の
 * snapshot が上書きするまで読む価値がある (古いことは帯が言う)。戻るのは人が
 * 明示的に切断した時だけで、それは持っているものを捨てる操作そのもの。 */
export const listed = signal(false);

/** 端末の一覧を**一度でも**受け取ったか。
 *
 * セッションの一覧とは別に持つ。起動しただけでまだ名乗っていないハーネスの行
 * (`startingRuns`) はこの topic からしか出てこないので、これが届く前の一覧は
 * 「起動中のものは無い」と言っているのではなく、まだ聞いていないだけ。 */
export const terminalsListed = signal(false);

/** 一覧が立つのに要るものを、どれも受け取り切ったか。
 *
 * 「何も無い」と「まだ聞いていない」は違うことなので、空の一覧を出す前にこれを
 * 読む。画面にも出る (`data-settled`) — 出しておくと、絵を撮る側が「行が届く
 * 途中」を撮らずに済む。 */
export const listSettled = computed(() => listed.value && terminalsListed.value);
export const statusDetail = signal<string | undefined>(undefined);
export const hello = signal<HelloResult | undefined>(undefined);
/** Set once the instance and this build disagree about the contract. There is
 * no path back: the page asks for a reload rather than degrading. */
export const generationWarning = signal<string | undefined>(undefined);

/** 一覧を持ったまま、向こうに繋がせてもらえなくなったか (DR-0004 §2.4)。
 *
 * `stale` が「なぜ切れているか」を姿として分けないので、重ねるものを選ぶために
 * だけ持つ — 回線が届かないなら退がりながら繋ぎ直すだけでよく、許可が切れて
 * いるなら人に passkey をもう一度頼むほかに進みようが無い。 */
export const authLost = signal(false);

/** 再認証の頼みを今出しているか (DR-0004 §2.4)。
 *
 * `authLost` と分けて持つのは、**事実と、それを今どう出しているかが別だから**。
 * 許可が切れていることは人が閉じても変わらないが、重ねたものが閉じられないと
 * `stale` の「読むことはできる」(§2.5) が成り立たない — 後ろは不活のままで、
 * 切断もログアウトも読み込み直しも押せない端末が残る。閉じたら印から出し直す。 */
export const reauthShowing = signal(false);

/** 再認証の頼みを出し直す。許可が切れている時だけ意味を持つ。 */
export function askReauth(): void {
  if (authLost.peek()) reauthShowing.value = true;
}

/** 再認証の頼みを閉じる。**許可が切れている事実は下ろさない** — 下ろすと印から
 * 出し直す道まで消える。 */
export function dismissReauth(): void {
  reauthShowing.value = false;
}

const peerSlots = signal<readonly Slot<readonly PeerInfo[]>[]>([]);
const llmStatusSlots = signal<readonly Slot<LlmStatusData>[]>([]);
const llmRequestSlots = signal<readonly Slot<LlmRequestsData>[]>([]);
const agentSlots = signal<readonly Slot<readonly AgentInfo[]>[]>([]);
const errorSlots = signal<readonly Slot<ErrorsData>[]>([]);
const terminalSlots = signal<readonly Slot<readonly TerminalInfo[]>[]>([]);
const inboxSlots = signal<readonly Slot<readonly InboxMessage[]>[]>([]);
const instanceSlots = signal<readonly Slot<InstancesData>[]>([]);

/** 届かないまま消えた 1 通たち。
 *
 * frame は「消えた」しか言わないので、本文はここで覚える — 覚えないと、期限
 * 切れになったことは分かるのに何が期限切れになったかを言えない。接続の産物
 * なので接続と一緒に消える。 */
export const departedMessages = signal<readonly WaitingMessage[]>([]);

/** 覚えておく数の上限。届かなかった 1 通は読めば済むもので、溜める箱ではない。 */
const DEPARTED_LIMIT = 50;

/** まだ相手に渡っていない 1 通たち、instance が言うとおりに。 */
export const waitingMessages = computed<readonly InboxMessage[]>(() => rows(inboxSlots.value));

/** 相手ごとの待ち通数。 */
export const waitingBySid = computed<ReadonlyMap<Sid, number>>(() =>
  waitingCounts(waitingMessages.value),
);

export const sortKey = signal<SortKey>(loadSortKey());
export const route = signal<Route>(locationRoute());

export const peers = computed<readonly PeerInfo[]>(() =>
  sortPeers(rows(peerSlots.value), sortKey.value, pinned.value),
);
export const agents = computed<readonly AgentInfo[]>(() =>
  sortAgents(rows(agentSlots.value), rows(peerSlots.value)),
);
/** The sessions with a dialog of their own open, which is what puts a row under
 * the heading that says somebody has to answer it. Read from every harness row
 * rather than the ones the list shows on their own: the session that is waiting
 * is very often the one the peer list already carries. */
export const answering = computed<ReadonlySet<Sid>>(() => answeringSids(rows(agentSlots.value)));
/** ハーネスが言っている run ぜんぶ。
 *
 * `agents` と違って**間引かない** — あちらは一覧が自分で出す行を選んだ後のもの
 * で、セッションの行が既に持っている run は落ちている。端末との対応は pid の
 * 一致で出るので (契約 DR-0026)、落ちた run があると、そのセッションが居る端末
 * が「誰の物でもない端末」として出てしまう。 */
export const runRows = computed<readonly AgentInfo[]>(() => rows(agentSlots.value));
/** What each run says it is waiting on, by pid — the material a person picks a
 * run by. */
export const waitingForRuns = computed<ReadonlyMap<number, string>>(() =>
  waitingForByPid(rows(agentSlots.value)),
);
/** The mesh as the instances themselves state it, this one included.
 *
 * Read from the topic rather than from what `hello` answered: a link going down
 * is something a subscriber learns where it is already listening, and a
 * greeting's list is only ever as current as the moment it was greeted. */
export const instances = computed<readonly InstanceInfo[]>(() =>
  union(instanceSlots.value, "instances"),
);
/** What this instance can do, as it greeted. An op or a topic whose capability
 * is outside this set is not offered — asking for one is how a screen learns by
 * being refused, which is a screen that should not have been drawn. */
export const capabilities = computed<readonly Capability[]>(() => hello.value?.capabilities ?? []);

export function can(capability: Capability): boolean {
  return capabilities.value.includes(capability);
}

/** 各 instance の gateway が言っている上流の様子。instance ごとに 1 通で、
 * どれか 1 つに畳まない — 別々の gateway の別々の報告なので、混ぜると
 * どちらの話かが消える。 */
export const llmStatusReports = computed<readonly Slot<LlmStatusData>[]>(
  () => llmStatusSlots.value,
);

/** 系列ごとの最新の 1 件を、mesh ぜんぶ分。cache の窓はセッションに付くもので、
 * どの instance の gateway が見たかは窓の持ち主を変えない。 */
export const llmRequests = computed<readonly LlmRequestInfo[]>(() =>
  llmRequestSlots.value.flatMap((slot) => slot.data),
);

/** The gateway that fronts this instance's terminals, when it fronts any. */
export const terminalGateway = computed<string | undefined>(() => hello.value?.terminal_gateway);
/** The terminal each session is opened through, out of the runs on its own row.
 * A session with two runs is one a person picks a run of first, so what is here
 * is the first run that names one (`terminalOf`). */
export const terminalIds = computed<ReadonlyMap<Sid, string>>(() =>
  terminalIdsBySid(rows(peerSlots.value)),
);
/** この mesh にある端末ぜんぶ、instance が言うとおりに。
 *
 * セッションとは独立した一覧で、どのセッションが居るかはここでは言わない —
 * 結び付けるのは pid で、それをするのは契約の導出 (`terminalsOf` /
 * `unattachedTerminals` / `starting`)。 */
export const terminals = computed<readonly TerminalInfo[]>(() => rows(terminalSlots.value));

/** 端末の一覧を、行がセッションに対して何であるかで分けたもの。 */
export const terminalGroups = computed<readonly TerminalGroup[]>(() =>
  groupTerminals(terminals.value, runRows.value),
);

/** 起動したのに、まだ状態ファイルも挨拶も無いハーネスの端末。セッションの一覧に
 * 並ぶ — sid がまだ無いので、名乗れるのは端末の id だけ。 */
export const startingRuns = computed<readonly TerminalInfo[]>(() =>
  startingTerminals(terminals.value, runRows.value),
);

/** 1 つのセッションが動いている端末たち。
 *
 * run が消えれば答えは空になり、その端末は一覧の側に戻る — 画面の側で覚えて
 * おくものは何も無い。 */
export function terminalsOfSession(sid: Sid): readonly TerminalInfo[] {
  return sessionTerminals(sid, terminals.value, runRows.value);
}

/** そのセッションを開ける端末 1 つ。一覧の行やタブのように「開けるか / どこを
 * 開くか」だけが要る所のための答えで、2 つある時は新しい方。
 *
 * 一覧との突き合わせが先で、答えが無い時だけ run が状態ファイルから知っている
 * 値に落ちる — 端末管理を持たない instance ではそれが唯一の手掛かりで、持って
 * いる instance では pid の一致が優先する (契約 DR-0026 §2)。 */
export function terminalIdOfSession(sid: Sid): string | undefined {
  return terminalsOfSession(sid)[0]?.id ?? terminalIds.value.get(sid);
}

export const sessionErrors = computed<ReadonlyMap<Sid, SessionErrorEntry>>(() =>
  errorsBySid(union(errorSlots.value, "errors")),
);

/** The transcript of the session the URL names, or nothing when the URL names
 * no session. One at a time: a screen shows one timeline, and a subscription
 * kept for a session nobody is looking at is a file being tailed for nobody. */
export const transcript = signal<TranscriptItemsView | undefined>(undefined);

/** 今開いている 1 つのセッションの状態 (`session.status:<sid>`)。
 *
 * transcript と同じで**一度に 1 つ**。畳んだ状態は instance が transcript から
 * 導いたもので、誰も見ていないセッションの分まで購読するのは、読まれない写しを
 * 運ばせることになる。 */
export const sessionStatus = signal<SessionStatusSnapshot | undefined>(undefined);

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

/** 型ごとの表示属性と、今読んでいる TL の畳み 1 つ 1 つの開閉。
 *
 * 表示属性は各 fold が落ちる**既定**なので、変更は各 fold を書き換えるのでは
 * なく読み手の上書きを捨てることで効く — store が各 fold の既定を知らないまま、
 * 誰も触っていない fold が設定に従う、という形。 */
export const timelineFaces = signal<DisplayFaces>(loadDisplayFaces());
export const timelineFolds = signal(new FoldOpen());

/** 設定画面が編集する側の面 (画面に出ている面とは限らない — もう一面はタブで
 * 切り替えて触れる)。 */
export function displayFace(subject: Subject): DisplayFace {
  return { subject, settings: timelineFaces.value[subject] };
}

/** 覚えていた読み方。instance にもセッションにも依らないので、繋ぐ前に — この
 * module が読まれた所で — 1 度読めば足りる。 */
function loadDisplayFaces(): Record<Subject, DisplaySettings> {
  const read = { main: {}, sub: {} } as Record<Subject, DisplaySettings>;
  for (const subject of SUBJECTS) {
    read[subject] = parseDisplaySettings(localStore.get(displayStorageKey(subject)));
  }
  return read;
}

function writeDisplay(subject: Subject, next: DisplaySettings): void {
  timelineFaces.value = { ...timelineFaces.value, [subject]: next };
  // どの fold も自分の既定に戻る — その既定を今変えたところなので。手で開いた
  // 分は古い既定への答えなので持ち越さない。
  timelineFolds.value.reset();
  localStore.set(displayStorageKey(subject), formatDisplaySettings(next));
}

export function setTimelineDisplay(
  subject: Subject,
  type: string,
  axis: DisplayAxis,
  value: boolean,
): void {
  writeDisplay(subject, setDisplay(timelineFaces.value[subject], type, axis, value));
}

export function clearTimelineDisplay(subject: Subject, type: string): void {
  writeDisplay(subject, clearDisplay(timelineFaces.value[subject], type));
}

/** How a `peers` row is matched: one session lives on one instance, so
 * `instance` and `sid` together is what makes two hosts' rows tellable apart
 * under one topic name. */
function sessionRowKey(row: { instance: string; sid: string }): string {
  return `${row.instance} ${row.sid}`;
}

/** How an `agents` row is matched (contract, `AgentInfo`). A row there is one
 * process and not one session: two processes may be running one session, and a
 * launcher's process is a row before it has a session at all — so the pid is
 * what the row is keyed by, and a removal names the same pair. */
function runRowKey(row: { instance: string; pid: number }): string {
  return `${row.instance} ${String(row.pid)}`;
}

const peerRows = new ElementFold<PeerElement, PeerInfo>("peers", sessionRowKey);
/** 待っている 1 通たち。鍵は `mid` — 1 通は自分の id で照合され、どの instance
 * が持っているかは鍵にしない (mid の中に既に instance が入っている)。 */
const inboxRows = new ElementFold<InboxElement, InboxMessage>("inbox", inboxKey);
const agentRows = new ElementFold<AgentElement, AgentInfo>("agents", runRowKey);
/** 端末の行。鍵は `instance` と `id` — 端末は host の資源なので、どの host の
 * ものかまで込みで 1 つの端末 (契約 `TerminalInfo`)。 */
const terminalRows = new ElementFold<TerminalElement, TerminalInfo>("terminals", terminalRowKey);

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
      // **意図しない切断では、聞いたものを捨てない**。回線が切れただけの端末が
      // 画面まで空になるのは、持ち歩いて読む道具としては失いすぎで、次の
      // snapshot が同じ行を上書きするまでの間、最後に聞いた内容には読む価値が
      // ある。古いことは状態の印が言う (`StatusMark`)。
      //
      // 捨てるのはここで意味を失うものだけ。
      // 期限は「この接続がいつまで許されているか」なので、接続と一緒に消える。
      // access token 自体はまだ生きているかもしれないので手を付けない。
      connectionExpiresAt.value = undefined;
      // 通知は「今それが起きた」という知らせなので、話し相手が居なくなった
      // 時点で古い。畳まずに捨てる。
      notifications.value = [];
      toast.value = undefined;
      // 届かないまま消えた 1 通の控えは、聞いていた接続のもの。行そのもの
      // (`inboxSlots`) は他の写しと同じで、次の snapshot が来るまで残す。
      departedMessages.value = [];
      // 木もファイル本文も「聞いた時点の写し」なので、話し相手が居なくなったら
      // 次に繋がった時に取り直す (捨てはしない — 読んでいた画面が空になるより、
      // 古いと分かる形で残る方がよい)。
      files.peek()?.dropped();
    }
  },
  greeted(result) {
    hello.value = result;
    // 能力で決まる topic は、greeting が来てから頼む。持っていない instance に
    // 頼めば断られるだけで、断られたことを画面に出す意味も無い。
    for (const [capability, topic] of CAPABILITY_TOPICS) {
      if (result.capabilities.includes(capability)) connection.subscribe(topic);
    }
    // The connection's own deadline, which is what is renewed on it. Absent
    // where reaching the instance is itself the permission, and then there is
    // nothing to renew.
    connectionExpiresAt.value = result.auth_expires_at;
  },
  topic(message) {
    if (message.topic.startsWith("session.status:")) {
      // whole 粒度なので、届いた frame がそのまま今の状態。
      sessionStatus.value = message.data as SessionStatusSnapshot;
      return;
    }
    const view = transcript.value;
    if (view !== undefined && message.topic === view.topic) {
      view.take(message.data as { sid: Sid; items?: TranscriptItem[] });
      return;
    }
    switch (message.topic) {
      case "peers":
        if (message.snapshot) listed.value = true;
        peerSlots.value = peerRows.push(
          message.instance,
          (message.data as PeersData).peers,
          message.snapshot,
        );
        break;
      case "instances":
        instanceSlots.value = fold<InstancesData>("instances").push(
          message.instance,
          message.data as InstancesData,
        );
        break;
      case "agents":
        agentSlots.value = agentRows.push(
          message.instance,
          (message.data as AgentsData).agents,
          message.snapshot,
        );
        break;
      case "terminals":
        if (message.snapshot) terminalsListed.value = true;
        terminalSlots.value = terminalRows.push(
          message.instance,
          (message.data as TerminalsData).terminals,
          message.snapshot,
        );
        break;
      case "llm.status":
        llmStatusSlots.value = fold<LlmStatusData>("llm.status").push(
          message.instance,
          message.data as LlmStatusData,
        );
        break;
      case "llm.requests":
        llmRequestSlots.value = fold<LlmRequestsData>("llm.requests").push(
          message.instance,
          message.data as LlmRequestsData,
        );
        break;
      case "inbox": {
        const elements = message.data as readonly InboxElement[];
        // 落ちる前に本文を取る — 畳みは `removed` の行を落とすので、後からでは
        // 何が消えたのかを言えない。
        departedMessages.value = rememberDepartures(
          departedMessages.peek(),
          rows(inboxSlots.peek()),
          elements,
          DEPARTED_LIMIT,
        );
        inboxSlots.value = inboxRows.push(message.instance, elements, message.snapshot);
        break;
      }
      case "session.errors":
        errorSlots.value = fold<ErrorsData>("session.errors").push(
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
  authRequired(why: TokenMissing) {
    // **届かないのは、許可が切れたのとは違う** (DR-0004 §2.3)。頼むことが無いので
    // 何も頼まず、接続が退がりながら掛け直すのを待つ — ここで passkey を頼むと、
    // 電波の悪い所を歩いた人が、許可は切れていないのに認証を迫られる。
    if (why === "unreachable") {
      statusDetail.value = "instance に届きません。繋ぎ直しています…";
      return;
    }
    // Held while the socket was open and no longer accepted: the token ran out
    // on the far side, or the session was ended elsewhere. The passkey is not
    // asked for here — nobody pressed anything, and a browser refuses a passkey
    // that no gesture is behind — so what is raised is the way to offer it.
    wanted.value = false;
    needsRegistration.value = false;
    // **一覧を持っている姿では、許可が切れても読んでいたものを捨てない**
    // (DR-0004 §2.3)。許可が向こうで切れたという事実は同じでも、それを理由に
    // 画面を消す必要は無い — 人に頼むのは passkey をもう一度だけで、通れば
    // その場で繋ぎ直る。捨てるものがまだ無い姿でだけ認証の画面へ行く。
    if (listed.peek()) {
      authLost.value = true;
      reauthShowing.value = true;
      return;
    }
    needsSignIn.value = true;
    authProblem.value = "接続が許可されませんでした。passkey で認証し直してください。";
  },
  generationMismatch(reason) {
    generationWarning.value = reason;
  },
});

/** 状態の画面を開いている間だけ購読する。URL がその tab を指していることが
 * 「読んでいる」の唯一の根拠で、離れた時に解くのも同じ 1 か所。 */
effect(() => {
  const at = route.value;
  const wanted =
    at.at === "session" && at.tab === "status"
      ? (`session.status:${at.sid}` as TopicName)
      : undefined;
  if (wanted === undefined) {
    sessionStatus.value = undefined;
    return;
  }
  connection.subscribe(wanted);
  return () => {
    connection.unsubscribe(wanted);
    sessionStatus.value = undefined;
  };
});

// Which transcript is being read is decided by the URL and by nothing else, so
// entering, leaving, and moving between sessions are one rule rather than three
// call sites that have to agree. An agent route names the same session and one
// agent below it, which is a different transcript and so a different view.
effect(() => {
  const at = route.value;
  const wanted = at.at === "session" || at.at === "agent" ? at.sid : undefined;
  const agentId = at.at === "agent" ? at.agentId : undefined;
  const held = transcript.peek();
  if (held?.sid === wanted && held?.agentId === agentId) return;
  held?.close();
  if (wanted === undefined) {
    transcript.value = undefined;
    return;
  }
  const view = new TranscriptItemsView(connection, wanted, timelineFaces, agentId);
  // A fold's state is about the transcript being read, so moving to another
  // session starts from that session's own settings and no held overrides.
  timelineFolds.value = new FoldOpen();
  transcript.value = view;
  view.open();
});

// 手放した item の fold は、その item ごと画面から無くなったので開閉も消す。
// 落とすのと同じ契機で消すのは、残しても「もう無いものの開閉」でしかなく、
// 遡り読みで戻ってきた item は読み手の既定から始まるべきだから。
effect(() => {
  const view = transcript.value;
  if (view === undefined) return;
  const held = new Set<string>();
  for (const item of view.items.value) {
    held.add(item.id);
    held.add(item.uuid);
  }
  forgetFoldsOutside(timelineFolds.peek(), held);
});

/** The files tab's state for the session the URL names, or nothing when the URL
 * names another tab. Made and dropped by the same rule the transcript is. */
export const files = signal<FilesView | undefined>(undefined);

/** ファイルの名前らしき語を探した結果の置き場。
 *
 * 画面ではなく接続に属する。同じ語が会話にも文書にも出るし、tab を行き来する
 * たびに訊き直すほどのことでもない。 */
export const fileWords = new FileWordIndex((op, args) => connection.request(op, args));

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

/** The person's other tabs at the instance being dialed: who refreshes, and
 * what they all hold once one of them has (daemon DR-0001 §2.4). The endpoint is read
 * each time it is needed, so tabs that move to another instance move the name
 * they coordinate under with them. */
const tabs = new TabShare({
  endpoint: () => endpoint.peek(),
  user: () => user.peek(),
  session: () => {
    const held = access.peek();
    const who = user.peek();
    return held === undefined || who === undefined || !tokenIsLive()
      ? undefined
      : { user: who, access: held };
  },
  locks: navigator.locks as LockManager | undefined,
});

tabs.listen((shared) => {
  if (shared.access.value !== access.peek()?.value) holdSession(shared);
});

/** Refresh as one of the person's tabs rather than as a page on its own: the
 * rotation happens once and its answer reaches the others. */
async function renewSession(at: string, reason: AuthRefreshReason): Promise<AuthSession> {
  const run = (): Promise<AuthSession> => refreshSession(at, reason);
  return await tabs.renew(run);
}

/** The access token to open the next socket with.
 *
 * Asked for on every attempt, so a reconnection on the far side of a token's
 * life renews rather than fails: what is held in memory is presented while it
 * lasts, and the refresh cookie is what answers when it does not. Nothing to
 * present raises the sign-in screen, which is the only way back.
 *
 * `renew` is the handshake saying the token was refused: the expiry held here
 * is then not the question, because the token belongs to the family and not to
 * this page, and asking the cookie is the only way to learn what stands. */
async function accessToken(renew = false): Promise<TokenAnswer> {
  const standing = access.peek();
  if (!renew && standing !== undefined && tokenIsLive()) return { token: standing.value };
  const at = endpoint.peek();
  if (at === undefined) return { missing: "auth_invalid" };
  // What another tab has already settled on, before asking for a rotation of
  // this page's own: the token is the family's, so one tab's answer is every
  // tab's answer.
  const shared = tabs.fresh();
  if (shared !== undefined && shared.access.value !== access.peek()?.value) {
    holdSession(shared);
    return { token: shared.access.value };
  }
  try {
    const session = await renewSession(at, connectRefreshReason());
    // The person may have stated another instance while this was in flight. A
    // token says who, never where, so one minted for the instance just left
    // would be presented to the new one as if it were its own.
    if (endpoint.peek() !== at) return { missing: "auth_invalid" };
    holdSession(session);
    return { token: session.access.value };
  } catch (cause) {
    // The endpoint being unreachable is not the session being over. Keeping
    // what is held lets the socket's own retry ride a daemon restart out
    // instead of turning it into a sign-in screen.
    const held = access.peek();
    if (!isNoSession(cause) && renew && held !== undefined && tokenIsLive()) {
      authProblem.value = describeAuthError(cause);
      return { token: held.value };
    }
    // **届かないことは、許可が切れたことではない** (DR-0004 §2.3)。持っているもの
    // を手放すと、回線が戻った時に passkey からやり直すことになる — 期限を過ぎた
    // token は次の refresh が取り直すので、手放す必要がそもそも無い。
    if (isUnreachable(cause)) return { missing: "unreachable" };
    forgetSession();
    // A first visit has no cookie, and being told so reads as a failure of
    // something the person did. Only a refusal that is not simply "no session
    // here" is worth saying out loud.
    if (!isNoSession(cause)) authProblem.value = describeAuthError(cause);
    return { missing: "auth_invalid" };
  }
}

/** Whether this page is meant to be connected just now.
 *
 * What the button says, and what says it: the status beside it is what the
 * socket is doing, which passes through closed and back while a retry is
 * running. Holding the intent apart from the state is what keeps a person from
 * reading "切断" on a page that is still trying to come back, and what makes
 * pressing the button always do the other thing from what it says. */
export const wanted = signal(false);

/** 画面ぜんぶのうち、どの姿で立つか (DR-0004 §2.1)。
 *
 * **代入されるものではない**。遷移の引き金はどれもこの module の signal の変化
 * そのものなので、導く (§2.2) — 代入する形にすると同じ事実が 2 か所に住み、
 * 遷移を書き忘れた経路で姿が固まったまま動かなくなる。規則そのものは
 * `src/phase.ts` で、ここはそこへ材料を渡す 1 行。 */
export const phase = computed<Phase>(() =>
  phaseOf({
    enrolling: enrolment.value !== undefined,
    needsSignIn: needsSignIn.value,
    listed: listed.value,
    open: status.value === "open",
    greeting: status.value === "greeting",
    wanted: wanted.value,
  }),
);

/** 一覧が立っている姿か。DR-0003 §2.2 の木の根はこれを読む (§2.5)。 */
export const connected = computed<boolean>(() => isConnected(phase.value));

/** Open the socket under this page's endpoint and subscribe to what the list
 * needs. Called with a session in hand: what to do when there is none is
 * decided before this, where the person's press is still live. */
function openSocket(at: string | undefined = endpoint.peek()): void {
  // Opened for the instance the session in hand was got for: what decided to
  // connect did so an await or two ago, and the field is the person's to change
  // in between.
  if (at === undefined || at !== endpoint.peek()) return;
  generationWarning.value = undefined;
  connection.connect(socketUrl(at), accessToken);
  for (const topic of TOPICS) connection.subscribe(topic);
}

/** Whether there is a session to open a socket with, asking the cookie when
 * memory has none. */
async function haveSession(): Promise<boolean> {
  return "token" in (await accessToken());
}

/** Connect, and authenticate on the way if that is what it takes.
 *
 * One press is the whole of it: what is held is used, a refresh cookie is
 * spent if that is what there is, and a browser with neither goes straight to
 * its passkey — in the same turn as the press, because asking for a passkey is
 * something a browser only allows while the person's gesture is still live. */
export async function connect(): Promise<void> {
  const at = endpoint.peek();
  if (at === undefined) return;
  wanted.value = true;
  needsSignIn.value = false;
  needsRegistration.value = false;
  authProblem.value = undefined;
  // 許可が切れているという事実も、重ねた頼みも、**通るまで下ろさない**。途中で
  // 下ろすと、断られた時に頼みごと消えて、`stale` の画面から出し直す道が一度
  // 閉じる (DR-0004 §2.3)。
  if (!(await haveSession()) && !(await signIn())) return;
  authLost.value = false;
  reauthShowing.value = false;
  openSocket(at);
}

/** Connect if it takes nothing from the person.
 *
 * What a reload does: a browser holding a refresh cookie is connected before
 * the page is looked at, and one holding nothing is left at a screen offering
 * to connect. Nothing about authenticating is said yet — there is nothing to
 * say until an attempt has been made. */
export async function resume(): Promise<void> {
  if (endpoint.peek() !== undefined && (await haveSession())) {
    wanted.value = true;
    openSocket();
    return;
  }
  // 繋げなかった。**URL はその人が受け取ったもの**で、この画面が勝手に書き換えて
  // よいものではない (DR-0004 §2.7) — 受け取ったリンクが一度の通信の失敗で
  // 失われるのは高く付く。捨ててよいのは、憶えた住所が無い端末だけ: そこはまだ
  // 誰のものでもないので、接続後の URL を出したままにしても出せるものが無い。
  if (localStore.get(ENDPOINT_KEY) === undefined && route.peek().at !== "sessions") {
    navigate({ at: "sessions" }, { replace: true });
  }
}

/** 人が「切断」を押した時に手放すもの。
 *
 * **instance が言っていたことは全部捨てる** — 一覧も、読んでいた transcript も、
 * 畳みの開閉も、access token も。残すのは localStorage に書いてある人の好み
 * (並び順・表示属性・下書き) と refresh cookie と憶えた住所で、「接続」を押せば
 * passkey 無しで戻れる。降りる (`signOut`) はそのどれも残さない (§2.6)。
 *
 * 意図しない切断はこれを通らない (`status` の closed はここを呼ばない)。切れた
 * だけで持ち物まで消えるなら、電波の悪い所を歩いた人は毎回ログインし直すことに
 * なる。 */
export function disconnect(): void {
  wanted.value = false;
  needsSignIn.value = false;
  needsRegistration.value = false;
  authLost.value = false;
  reauthShowing.value = false;
  authProblem.value = undefined;
  connection.close();
  peerSlots.value = [];
  agentSlots.value = [];
  errorSlots.value = [];
  terminalSlots.value = [];
  instanceSlots.value = [];
  llmStatusSlots.value = [];
  llmRequestSlots.value = [];
  folds.clear();
  peerRows.clear();
  agentRows.clear();
  terminalRows.clear();
  hello.value = undefined;
  listed.value = false;
  terminalsListed.value = false;
  transcript.value = undefined;
  sessionStatus.value = undefined;
  // 読んでいた file の本文も instance から聞いたもの。木と本文の写しは捨て、
  // どの file を開いていたかの記憶 (localStorage) は人の設定なので残す。
  files.value = undefined;
  timelineFolds.value = new FoldOpen();
  notifications.value = [];
  toast.value = undefined;
  inboxSlots.value = [];
  inboxRows.clear();
  departedMessages.value = [];
  // 自分の姿も instance が言っていたこと。次に繋ぐ人が同じ人とは限らない。
  account.value = undefined;
  accountProblem.value = undefined;
  forgetSession();
}

/** この端末から降りる (DR-0004 §2.6)。
 *
 * 切断との違いは**後に残るもの**。切断は socket を閉じるだけで、refresh cookie
 * も憶えた住所も残るので「接続」を押せば passkey 無しで戻れる。降りるのは
 * そのどれも残さないことで、戻るには passkey からやり直す。
 *
 * **向こうに頼むのが先**。契約の `auth.signout` が token family を失効させ、その
 * 応答が refresh cookie を期限切れにする — cookie は HttpOnly でこの画面からは
 * 消せないので、手元だけ消しても cookie を持った別のタブが繋がり続ける (契約
 * DR-0030 §5)。
 *
 * **向こうが答えなくても手元は消す**。降りると決めた人の端末に跡が残る方が悪く、
 * family が生きていることは次に繋いだ時にまた降りれば済む。届かなかったことは
 * 言葉にして残す — 黙って消すと、別のタブがまだ繋がることの説明が付かない。 */
/** 降りた端末のメモリから、instance のセッションを名指しているものを落とす。
 *
 * `clearLocal` が消すのは書いてある方だけで、**読み込みの時に 1 度だけ読んだ写し
 * はメモリに残る** — 同じタブで次の人が入ると、一覧が前の人の留めで始まり、留めを
 * 1 つ動かせば消したはずの名前が前の値ごと書き戻る。好みではないものだけをここで
 * 落とす: どれも「どのセッションを追いかけているか」で、降りた人のもの。 */
function forgetWhatNamedSessions(): void {
  pinned.value = new Set();
  unkilled.value = new Set();
  listCollapsed.value = new Set();
  listCursor.value = undefined;
  listFilter.value = "";
  listFilterOpen.value = false;
  selectedItem.value = undefined;
}

export async function signOut(): Promise<void> {
  const at = endpoint.peek();
  let refused: string | undefined;
  if (at !== undefined) {
    try {
      await signOutSession(at);
    } catch (cause) {
      refused = describeAuthError(cause);
    }
  }
  disconnect();
  clearLocal(keepsPreferences());
  forgetWhatNamedSessions();
  // 憶えた住所も消えたので、次に立つのはこのページ自身の住所が入ったトップ
  // (§2.7 の「憶えた住所が無い」端末)。
  endpoint.value = endpointFromLocation(location.origin, BASE);
  tabs.moved();
  navigate({ at: "sessions" });
  authProblem.value =
    refused === undefined
      ? undefined
      : `この端末からは降りましたが、instance に失効を頼めませんでした (${refused})。別のタブが繋がったままのことがあります。`;
}

/** Prove a passkey and hold what it minted.
 *
 * No relying party is named: a passkey answers for the domain of the page
 * asking, which is the origin it was made at — and which instance its holder
 * may enter is not its question at all (contract DR-0030 §2). Answers whether
 * there is a session now; what raises a screen is the refusal, which is where
 * what the person can do next is known. */
export async function signIn(): Promise<boolean> {
  const at = endpoint.peek();
  if (at === undefined) return false;
  authProblem.value = undefined;
  try {
    const session = await assertPasskey(at);
    // As in `accessToken`: a session got for the instance just left is not one
    // to hold while another is being dialed.
    if (endpoint.peek() !== at) return false;
    holdSession(session);
    needsSignIn.value = false;
    needsRegistration.value = false;
    authLost.value = false;
    reauthShowing.value = false;
    return true;
  } catch (cause) {
    wanted.value = false;
    // **一覧を持っている間は、断られても画面を捨てない** (DR-0004 §2.3)。重ねた
    // 再認証を人が取り消すのは「今はやらない」であって、読んでいたものを捨てて
    // よいという意思ではない — 姿は `stale` のままで、頼みは印から出し直せる。
    const keeping = listed.peek();
    needsSignIn.value = !keeping;
    authLost.value = keeping;
    // Declined or unregistered: registering is the way in, and this is the
    // moment it becomes worth saying. Anything else is the instance's own
    // words, which say what happened instead.
    needsRegistration.value = isSignInDeclined(cause);
    authProblem.value = needsRegistration.value ? undefined : describeAuthError(cause);
    return false;
  }
}

/** Stand a passkey in the browser's own autofill, and take it if it is chosen.
 *
 * The other way in is a button, which is a prompt the person asked for. This is
 * the offer that waits: somebody who has not been here in a while sees their
 * passkey among the browser's suggestions instead of having to remember that
 * the button is what they want. Nothing is asked of them — an offer nobody
 * takes ends when the screen does.
 *
 * Answers with how to take the offer back down, for the screen to call when it
 * goes away: a standing `credentials.get()` outlives the screen that asked for
 * it, and a second one raised beside it is refused by the browser. */
export function offerPasskey(): () => void {
  const controller = new AbortController();
  void (async () => {
    const at = endpoint.peek();
    if (at === undefined || !(await canOfferPasskey())) return;
    try {
      const session = await assertPasskey(at, {
        mediation: "conditional",
        signal: controller.signal,
      });
      // As in `signIn`: a session got for the instance just left is not one to
      // hold while another is being dialed.
      if (endpoint.peek() !== at) return;
      holdSession(session);
      needsSignIn.value = false;
      needsRegistration.value = false;
      wanted.value = true;
      openSocket(at);
    } catch {
      // An offer that was not taken, or one this screen took back down. Neither
      // is a failure of anything the person did, and the button is still there.
    }
  })();
  return () => {
    controller.abort();
  };
}

/** Carry out what an enrolment link authorized, and connect on what it answers.
 *
 * Which ceremony runs is the claims' answer and not the form's: making the
 * person creates a passkey, and handing them an instance asserts the one they
 * have (contract DR-0030 §4). Both spend the same URL with the same six digits
 * from the terminal.
 *
 * The name is only the person's to settle where they are being made. A URL that
 * adds an instance joins an account they have already named, and registering
 * again does not rename them. */
export async function completeEnrolment(
  code: string,
  said: { displayName?: string; deviceLabel?: string } = {},
): Promise<void> {
  const held = enrolment.peek();
  if (held === undefined) return;
  authProblem.value = undefined;
  try {
    const session =
      held.claims.purpose === "create_user"
        ? await registerPasskey({
            token: held.token,
            claims: held.claims,
            code,
            displayName: said.displayName ?? "",
            ...(said.deviceLabel === undefined ? {} : { deviceLabel: said.deviceLabel }),
          })
        : await enrolInstance({ token: held.token, claims: held.claims, code });
    // The link is spent and the issuing instance has answered for it, so what
    // it named is now something this page has been told rather than something a
    // fragment claimed: this is where the instance becomes the one being dialed.
    setEndpoint(held.claims.endpoint);
    holdSession(session);
    enrolment.value = undefined;
    wanted.value = true;
    openSocket();
  } catch (cause) {
    authProblem.value = describeAuthError(cause);
  }
}

/** Leave the enrolment screen without carrying it out. What the link authorized
 * is untouched — it is spent by the ceremony and by nothing else. */
export function dismissEnrolment(): void {
  enrolment.value = undefined;
  authProblem.value = undefined;
  void resume();
}

/** The person's own account, as the instance answers it: who they are, the
 * passkeys that answer for them, and the instances they own (contract DR-0030
 * §8).
 *
 * Read when the screen showing it is opened and after anything on it is
 * removed, rather than held between visits. It is the instance's answer about
 * records that other instances also write, so what a page kept would be a
 * picture of a moment it cannot tell has passed. */
export const account = signal<AuthAccountReadResult | undefined>(undefined);
export const accountProblem = signal<string | undefined>(undefined);

export async function readAccount(): Promise<void> {
  if (status.peek() !== "open") return;
  try {
    account.value = (await connection.request(
      "auth.account.read",
      {},
    )) as unknown as AuthAccountReadResult;
    accountProblem.value = undefined;
  } catch (cause) {
    accountProblem.value = describeRefusal(cause);
  }
}

/** Give up one instance, or one passkey, and read back what is left.
 *
 * The one the connection stands on is refused by the instance rather than
 * hidden here (`auth_in_use`): what may be let go of is the instance's to say,
 * and a screen that guessed at it would be a second answer to go out of step. */
export async function removeOwnership(instance: string): Promise<void> {
  await forget("auth.ownership.remove", { instance });
}

export async function removeCredential(credentialId: string): Promise<void> {
  await forget("auth.credential.remove", { credential_id: credentialId });
}

async function forget(op: string, args: Record<string, unknown>): Promise<void> {
  try {
    await connection.request(op, args);
    accountProblem.value = undefined;
  } catch (cause) {
    accountProblem.value = describeRefusal(cause);
  }
  await readAccount();
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
 * token from the cookie, and `auth.extend` on this very connection moves its
 * deadline — a client that reconnected to use a fresh token would blink every
 * few hours for no reason (daemon DR-0001 §2.5). */
async function renewConnection(): Promise<void> {
  const at = endpoint.peek();
  if (at === undefined || status.peek() !== "open") return;
  try {
    const session = await renewSession(at, "expiring");
    if (endpoint.peek() !== at) return;
    holdSession(session);
    const token = access.peek()?.value;
    if (token === undefined) return;
    const reply = await connection.request("auth.extend", { access_token: token });
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

/** 一覧のペインを出しているか。
 *
 * このブラウザの好みなので instance で分けない (同じ人が同じ画面で同じ広さを
 * 使う)。狭い画面ではこの値ではなく **URL** が「今どちらを見ているか」を決める
 * — 一覧とセッションは並んで居るのではなく、行き来する 2 枚になる。 */
export const sessionsOpen = signal(parseSessionsOpen(localStore.get(sessionsOpenKey())));

export function toggleSessionsOpen(): void {
  sessionsOpen.value = !sessionsOpen.value;
  localStore.set(sessionsOpenKey(), formatSessionsOpen(sessionsOpen.value));
}

/** 一覧のカーソルが今指している単位 (`src/sessions-cursor.ts` の名前)。
 *
 * **選ぶことと開くことは別** (DR-0003 §2.2): ここが動くのは辿っている間だけで、
 * 開くのは決定の時。カーソルが乗っただけで開くと、辿る途中の行を全部読み込みに
 * 行くことになる。行に効く操作 (改名・終了・留める) が対象にするのはこちらで、
 * 開いている行ではない。 */
export const listCursor = signal<string | undefined>(undefined);

/** 畳んであるセクション。畳んだセクションは一覧の軸の上で 1 単位になる。 */
export const listCollapsed = signal<ReadonlySet<string>>(new Set());

export function toggleListSection(section: string, collapsed: boolean): void {
  const next = new Set(listCollapsed.value);
  if (collapsed) next.add(section);
  else next.delete(section);
  listCollapsed.value = next;
}

/** 今並んでいるものを絞る言葉 (クイックフィルタ)。
 *
 * **オフラインのセッションを探すこととは別**のもの (§2.2)。同じ窓に見えても、
 * こちらは今並んでいるものを絞るだけで、一覧に無いものは取りに行かない。 */
export const listFilter = signal<string>("");
export const listFilterOpen = signal(false);

/** 起動のフォームを開いているか。開くことがアクションなので、開いているかは
 * 画面の state として外に出る (打鍵からも押す所からも同じ 1 つが起こす)。 */
export const launcherOpen = signal(false);

/** 今カーソルの行を改名している最中か。行の中の state ではなく画面の state なのは、
 * 打鍵からも押す所からも同じ 1 つのアクションが起こすため (§2.4)。 */
export const renaming = signal<Sid | undefined>(undefined);

/** 普通に頼んでも消えなかったセッション。強い方を出すかの材料で、instance が
 * そう言ったという事実 (契約) をそのまま持つ。 */
export const unkilled = signal<ReadonlySet<Sid>>(new Set());

export function markUnkilled(sid: Sid, stuck: boolean): void {
  const next = new Set(unkilled.value);
  if (stuck) next.add(sid);
  else next.delete(sid);
  unkilled.value = next;
}

/** 開いている確認。**危ないアクションの責務は、これを開くまで** (DR-0003 §2.8)
 * で、実際に終わらせるのはこの中の決定。キーから起こしても押す所から起こしても
 * 同じ 1 つのアクションを通るので、確認の出ない経路ができない。 */
export interface Confirmation {
  /** 何をしようとしているか。題はアクションの側から出る。 */
  readonly action: string;
  /** 決めた後に何が起きるか。 */
  readonly note: string;
  readonly go: () => void;
}

export const confirming = signal<Confirmation | undefined>(undefined);

export function askFirst(ask: Confirmation): void {
  confirming.value = ask;
}

export function dismissConfirm(): void {
  confirming.value = undefined;
}

/** 選んでいる transcript の 1 通 (§2.7)。同じ声の前後へ動く軸は、この 1 通が
 * 決めている。 */
export const selectedItem = signal<string | undefined>(undefined);

/** 留めてあるセッション。並びの先頭に来て、印が付く。 */
export const pinned = signal<ReadonlySet<Sid>>(loadPinned());

function loadPinned(): ReadonlySet<Sid> {
  const held = localStore.get(PINNED_STORAGE);
  if (held === undefined) return new Set();
  try {
    const read: unknown = JSON.parse(held);
    return new Set(
      Array.isArray(read) ? (read.filter((one) => typeof one === "string") as Sid[]) : [],
    );
  } catch {
    return new Set();
  }
}

export function togglePinned(sid: Sid): void {
  const next = new Set(pinned.value);
  if (!next.delete(sid)) next.add(sid);
  pinned.value = next;
  localStore.set(PINNED_STORAGE, JSON.stringify([...next]));
}

/** instance が持っている dump の献立。名前を列挙できるのはこの op だけなので、
 * これが無ければ画面は自由入力を出して instance に断らせるしかない (契約)。 */
export async function readDumpPresets(): Promise<DumpPresetsReadResult> {
  const reply = await connection.request("dump.presets.read", {});
  return reply as unknown as DumpPresetsReadResult;
}

/** transcript を 1 つの file に書き出す。**書くのは instance の host** で、
 * 返ってくるのはその場所と、何をどれだけ書いたか — 中身はここへ運ばない
 * (運ぶなら transcript を読めば足りる。この op の値打ちは、後で誰かに渡せる
 * file がそこに残ること)。 */
export async function writeSessionDump(
  args: SessionDumpWriteArgs,
): Promise<SessionDumpWriteResult> {
  const reply = await connection.request(
    "session.dump.write",
    args as unknown as Record<string, unknown>,
  );
  return reply as unknown as SessionDumpWriteResult;
}

/** セッションを終わらせる。`force` は**人が 1 度普通に頼んでから**選ぶもので、
 * 画面が自分で選ぶことはない (契約): 強い方は transcript を書き切る機会ごと
 * 奪うので、待った上で人が決める。 */
export async function killSession(
  sid: Sid,
  force = false,
  pid?: number,
): Promise<SessionKillResult> {
  const reply = await connection.request("session.kill", {
    sid,
    ...(pid === undefined ? {} : { pid }),
    ...(force ? { force: true } : {}),
  });
  return reply as unknown as SessionKillResult;
}

/** 名前を変える。instance は端末にそのセッション自身の改名コマンドを打つので、
 * 成功は「打鍵が届いた」であって「名前が変わった」ではない — 変わった名前は
 * 後から `agents` topic で届く (契約)。 */
export async function renameSession(sid: Sid, title: string): Promise<SessionRenameResult> {
  const reply = await connection.request("session.rename", { sid, title });
  return reply as unknown as SessionRenameResult;
}

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
  const path = href(next);
  if (options?.replace === true) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
}

export function adoptLocation(): void {
  route.value = locationRoute();
}

/** gateway に聞いた、日ごとの費用。`days` は「どれだけ遡るか」で、gateway は
 * 自分の持っている範囲へ狭めて答える — 持っている分より広く聞くのが「全部」の
 * 言い方 (契約)。 */
export async function readLlmStats(days: number): Promise<LlmStatsReadResult> {
  const reply = await connection.request("llm.stats.read", { days });
  return reply as unknown as LlmStatsReadResult;
}

/** 起動の献立 (どこで・どの手順で始められるか) を instance に聞く。
 *
 * 木も起動そのものも、選べる場所と手順を教えてはくれない — それを答えるのが
 * この op で、能力 `launcher` を持たない instance では入口自体を出さない。 */
export async function readLauncherConfig(): Promise<LauncherConfigReadResult> {
  const reply = await connection.request("launcher.config.read", {});
  return reply as unknown as LauncherConfigReadResult;
}

/** セッションを 1 つ始める。返ってくるのは**走らせた結果**で、始まった
 * セッションそのものではない — 立ち上がったセッションは自分で instance に
 * 名乗り、一覧にはその時に出る (ここでプロセスを追いかけない)。 */
export async function runLauncher(args: LauncherRunArgs): Promise<LauncherRunResult> {
  const reply = await connection.request(
    "launcher.run",
    args as unknown as Record<string, unknown>,
  );
  return reply as unknown as LauncherRunResult;
}

/** まだ開いていない transcript を instance に探させる (`session.search`)。
 *
 * 走るのは instance の側で、読むのはその host に置いてある file — この画面が
 * 持っているのは問いと、返ってきた行だけ。打ち切られた時は `truncated` がそう
 * 言うので、画面はそれを隠さずに出す (足りない結果を全部だと思って読む方が、
 * 探し直すより高く付く)。 */
export async function searchSessions(args: SessionSearchArgs): Promise<SessionSearchResult> {
  const reply = await connection.request("session.search", args);
  return reply as unknown as SessionSearchResult;
}

/** host の翻訳機に本文を渡す (`translate.run`)。呼ぶのは 1 段落ずつで、理由は
 * `src/timeline/translators.ts` に書いてある。 */
export async function runTranslate(texts: readonly string[]): Promise<TranslateRunResult> {
  const reply = await connection.request("translate.run", { texts: [...texts] });
  return reply as unknown as TranslateRunResult;
}

/** 本文を何で読むか。原文か、訳す人のどちらか。
 *
 * 画面ぜんぶで 1 つ。英語の transcript を読む人は「日本語で読む」と 1 度決める
 * のであって、item ごとに決め直したいわけではない。訳が走るのは**描かれている
 * item だけ**で、それは窓が描く範囲そのものなので、読んでいない所の訳に費用を
 * 払うことはない。 */
export const reading = signal<"original" | TranslateRoute>("original");

/** 今使える訳の経路。host は instance の能力、browser はこのブラウザの持ち物で、
 * どちらも無ければ画面は言語の選択肢を出さない。 */
export const translateRoutes = computed<readonly TranslateRoute[]>(() => [
  ...(can("translate") ? (["host"] as const) : []),
  ...(hasBrowserTranslator() ? (["browser"] as const) : []),
]);

/** 最後に使った訳す人。item の側の入口は「原文 ⇄ この人の訳」を往復するので、
 * どの人かをここが覚えている。まだ誰も選んでいなければ、使えるうちの最初の
 * 1 人 — 経路が 1 つしか無い環境では、それが唯一の答えになる。 */
const preferred = signal<TranslateRoute | undefined>(undefined);

export const preferredRoute = computed<TranslateRoute | undefined>(
  () => preferred.value ?? translateRoutes.value[0],
);

/** item の側から、原文と訳を往復する。**画面ぜんぶの設定を動かす** — 1 つの
 * item だけ訳す設定ではないので、押した所以外も一緒に切り替わる。読んでいる行が
 * 動かないのは錨が打ってあるから (`src/ui/Timeline.tsx` の `remember` / `place`)。 */
export function toggleReading(): void {
  if (reading.value !== "original") {
    reading.value = "original";
    return;
  }
  const route = preferredRoute.value;
  if (route !== undefined) reading.value = route;
}

/** 選んでいた経路が無くなったら原文へ戻す (別の instance に繋ぎ直した時)。
 * 消えた経路の訳をそのまま出し続けると、もう聞けない道具の答えが画面に残る。 */
effect(() => {
  const held = reading.value;
  if (held === "original") return;
  if (!translateRoutes.value.includes(held)) {
    reading.value = "original";
    return;
  }
  preferred.value = held;
});

/** gateway に聞いた、credential ごとのクオータ。
 *
 * `refresh` は **upstream に聞き直させる** 問い合わせで、契約が言うとおり
 * upstream の rate limit を使いうる (既に上限に当たっている account では、
 * その credential の error として返ってくる)。だから人が押した時にだけ渡し、
 * 定期の読みでは決して渡さない。 */
export async function readLlmUsage(refresh = false): Promise<LlmUsageReadResult> {
  const reply = await connection.request("llm.usage.read", refresh ? { refresh: true } : {});
  return reply as unknown as LlmUsageReadResult;
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
  return oversizeReason(connection.frameBytes("message.send", { to: sid, text }));
}

export async function sendMessage(sid: Sid, text: string): Promise<MessageSendResult> {
  const reply = await connection.request("message.send", { to: sid, text });
  return reply as unknown as MessageSendResult;
}

/** Ask the instance to forget one session it has lost, before its retention
 * window runs out on its own.
 *
 * The rows are the instance's, so nothing is dropped here: the `peers` frame
 * that follows carries the removal, which is also what makes two people
 * pressing the same button agree. */
export async function forgetLostSession(sid: Sid): Promise<void> {
  await connection.request("session.forget", { sid });
}
