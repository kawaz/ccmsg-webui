import {
  type ErrorResponse,
  type HelloResult,
  type InstanceId,
  isValid,
  PROTOCOL_VERSION,
  TOPIC_SCHEMAS,
  type TopicName,
  topicKind,
} from "@ccmsg/protocol";
import { frameByteLength } from "./frame-limit.ts";

/** The subprotocol value the access token travels in.
 *
 * Spelled here rather than imported: the contract covers what is said over a
 * connection, and how a connection is let in is the daemon's entry policy
 * (daemon §3.1), which this package does not depend on. */
const TOKEN_PROTOCOL = "ccmsg.token.";

/** Answers with the access token to open the next socket with, or with nothing
 * when there is none to be had.
 *
 * Asked again for every attempt rather than given once, because a token has a
 * few hours' life and a reconnection may be on the other side of it: the answer
 * is where a refresh happens, and nothing here has to know that it did. */
export type TokenSource = () => Promise<string | undefined>;

/** The one place a connection to an instance is made and kept.
 *
 * It owns the socket's life, the greeting that settles what this connection is,
 * the correlation of replies to requests, the subscriptions to re-establish
 * after a reconnection, and nothing about what any topic means. */

export type ConnectionStatus = "idle" | "connecting" | "greeting" | "open" | "closed";

export interface TopicMessage {
  readonly topic: string;
  readonly instance: InstanceId;
  readonly snapshot: boolean;
  readonly data: unknown;
}

export interface ConnectionEvents {
  status(status: ConnectionStatus, detail?: string): void;
  greeted(hello: HelloResult): void;
  topic(message: TopicMessage): void;
  /** The contract's generation and this build's do not agree, or the instance
   * does not know an op this build calls. There is no compatibility path: the
   * page says so and the person reloads a build that matches. */
  generationMismatch(reason: string): void;
}

interface Pending {
  resolve(body: Record<string, unknown>): void;
  reject(error: Error): void;
}

/** How long to wait before dialling again, doubling to a ceiling so a daemon
 * that is down does not turn into a busy loop. */
const RETRY_MIN_MS = 500;
const RETRY_MAX_MS = 10_000;

export class Connection {
  readonly #events: ConnectionEvents;
  readonly #topics = new Set<TopicName>();
  readonly #pending = new Map<string, Pending>();
  #url: string | undefined;
  #token: TokenSource | undefined;
  #socket: WebSocket | undefined;
  #buffer = "";
  #counter = 0;
  #retryMs = RETRY_MIN_MS;
  #retryTimer: ReturnType<typeof setTimeout> | undefined;
  #stopped = false;

  constructor(events: ConnectionEvents) {
    this.#events = events;
  }

  /** Point at an instance and keep a connection to it. Called again with
   * another endpoint, it drops the old one first. */
  connect(url: string, token: TokenSource): void {
    this.#stopped = false;
    this.#url = url;
    this.#token = token;
    this.#retryMs = RETRY_MIN_MS;
    void this.#open();
  }

  close(): void {
    this.#stopped = true;
    if (this.#retryTimer !== undefined) clearTimeout(this.#retryTimer);
    this.#retryTimer = undefined;
    this.#socket?.close();
    this.#socket = undefined;
    this.#events.status("idle");
  }

  /** Subscribe, and stay subscribed: the set is replayed after a reconnection,
   * so a caller states what it wants to see once. */
  subscribe(topic: TopicName): void {
    this.#topics.add(topic);
    if (this.#socket?.readyState === WebSocket.OPEN) void this.#subscribeNow(topic);
  }

  /** Stop wanting a topic. Dropped from the set first, so a reconnection does
   * not bring it back, and only then said over the wire. */
  unsubscribe(topic: TopicName): void {
    if (!this.#topics.delete(topic)) return;
    if (this.#socket?.readyState !== WebSocket.OPEN) return;
    this.request("topic_unsubscribe", { topic }).catch(() => {
      // A subscription on a connection that is gone is gone with it.
    });
  }

  /** これから `request` が送る 1 行の byte 長。
   *
   * 番号まで含めて実際に送る形で測る。数えるだけで番号は消費しないので、
   * 測ってから送るまでの間に行が変わることはない。 */
  frameBytes(op: string, args: Record<string, unknown> = {}): number {
    return frameByteLength({ op, request_id: String(this.#counter + 1), ...args });
  }

  /** Call an op and wait for the reply that names this request. */
  request(op: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const socket = this.#socket;
    if (socket === undefined || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("接続していません"));
    }
    this.#counter += 1;
    const requestId = String(this.#counter);
    return new Promise((resolve, reject) => {
      this.#pending.set(requestId, { resolve, reject });
      socket.send(`${JSON.stringify({ op, request_id: requestId, ...args })}\n`);
    });
  }

  async #open(): Promise<void> {
    const url = this.#url;
    const source = this.#token;
    if (url === undefined || source === undefined || this.#stopped) return;
    this.#events.status("connecting");
    const token = await source();
    if (this.#stopped) return;
    // Nothing to present. Dialling anyway would be refused, and retrying that
    // is a busy loop against a door that opens by authenticating instead.
    if (token === undefined) {
      this.#events.status("closed", "認証が必要です");
      return;
    }
    // A browser cannot put a header on a handshake, so the access token travels
    // as a subprotocol value (daemon §3.1). The plain name beside it is what
    // the instance selects when it has a choice.
    const socket = new WebSocket(url, ["ccmsg.v1", `${TOKEN_PROTOCOL}${token}`]);
    this.#socket = socket;
    this.#buffer = "";
    socket.addEventListener("open", () => {
      this.#retryMs = RETRY_MIN_MS;
      this.#events.status("greeting");
      void this.#greet();
    });
    socket.addEventListener("message", (event: MessageEvent) => {
      this.#take(String(event.data));
    });
    socket.addEventListener("close", () => {
      this.#dropped("接続が閉じました");
    });
    socket.addEventListener("error", () => {
      // A browser reports no status for a refused handshake, so what a 401 or a
      // 403 looks like here is exactly this: an error with nothing in it.
      this.#dropped("接続を拒否されたか、届きませんでした");
    });
  }

  #dropped(detail: string): void {
    if (this.#socket === undefined) return;
    this.#socket = undefined;
    for (const [, pending] of this.#pending) pending.reject(new Error(detail));
    this.#pending.clear();
    this.#events.status("closed", detail);
    if (this.#stopped) return;
    this.#retryTimer = setTimeout(() => {
      void this.#open();
    }, this.#retryMs);
    this.#retryMs = Math.min(this.#retryMs * 2, RETRY_MAX_MS);
  }

  async #greet(): Promise<void> {
    try {
      const reply = await this.request("hello", {
        role: "user",
        protocol_version: PROTOCOL_VERSION,
        client_version: __WEBUI_VERSION__,
      });
      const hello = reply as unknown as HelloResult;
      if (hello.protocol_version !== PROTOCOL_VERSION) {
        this.#events.generationMismatch(
          `instance は契約世代 ${hello.protocol_version}、この画面は ${PROTOCOL_VERSION} です`,
        );
        return;
      }
      this.#events.greeted(hello);
      this.#events.status("open");
      for (const topic of this.#topics) await this.#subscribeNow(topic);
    } catch (cause) {
      this.#events.status("closed", String(cause));
    }
  }

  async #subscribeNow(topic: TopicName): Promise<void> {
    try {
      await this.request("topic_subscribe", { topic });
    } catch (cause) {
      this.#events.status("open", `${topic} を購読できませんでした: ${String(cause)}`);
    }
  }

  #take(chunk: string): void {
    this.#buffer += chunk;
    let at: number;
    while ((at = this.#buffer.indexOf("\n")) >= 0) {
      const line = this.#buffer.slice(0, at);
      this.#buffer = this.#buffer.slice(at + 1);
      if (line.trim() === "") continue;
      this.#line(line);
    }
  }

  #line(text: string): void {
    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }
    if (frame["ev"] === "topic") {
      this.#topicFrame(frame);
      return;
    }
    if (frame["ev"] !== undefined) return;
    const requestId = frame["request_id"];
    if (typeof requestId !== "string") return;
    const pending = this.#pending.get(requestId);
    if (pending === undefined) return;
    this.#pending.delete(requestId);
    if (frame["ok"] === true) {
      pending.resolve(frame);
      return;
    }
    const error = (frame as unknown as ErrorResponse).error;
    if (error.code === "unknown_op" || error.code === "topic_unknown") {
      this.#events.generationMismatch(`instance が知らない ${error.code}: ${error.msg}`);
    }
    pending.reject(new Error(`${error.code}: ${error.msg}`));
  }

  #topicFrame(frame: Record<string, unknown>): void {
    const topic = frame["topic"];
    const instance = frame["instance"];
    if (typeof topic !== "string" || typeof instance !== "string") return;
    const kind = topicKind(topic);
    // Validated against the contract's own schema rather than against fields
    // read one by one here: a frame this build cannot verify is a disagreement
    // about the contract, which is the one thing there is no path for.
    if (kind === undefined || !isValid(TOPIC_SCHEMAS[kind], frame)) {
      this.#events.generationMismatch(`契約に合わない frame が届きました: ${topic}`);
      return;
    }
    this.#events.topic({
      topic,
      instance,
      snapshot: frame["snapshot"] === true,
      data: frame["data"],
    });
  }
}
