import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Connection, type ConnectionStatus } from "../src/connection.ts";

/** What a refused handshake does, and what dialling again does to the socket
 * that was already there.
 *
 * Against a stand-in socket rather than a daemon: what is being fixed is which
 * token the next attempt presents and which socket is the current one, and both
 * are decided here before anything reaches the wire. */

class FakeSocket {
  static readonly OPEN = 1;
  static readonly instances: FakeSocket[] = [];
  readyState = 0;
  closed = false;
  readonly sent: string[] = [];
  readonly #listeners = new Map<string, ((event: unknown) => void)[]>();

  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {
    FakeSocket.instances.push(this);
  }

  addEventListener(name: string, listener: (event: unknown) => void): void {
    const held = this.#listeners.get(name) ?? [];
    held.push(listener);
    this.#listeners.set(name, held);
  }

  send(line: string): void {
    this.sent.push(line);
  }

  close(): void {
    this.closed = true;
    this.readyState = 3;
    this.#emit("close");
  }

  /** The instance let the handshake through. */
  admit(): void {
    this.readyState = 1;
    this.#emit("open");
  }

  /** A handshake that was not admitted: a browser reports it with nothing in
   * it, which is why the token cannot be ruled out as the reason. */
  refuse(): void {
    this.readyState = 3;
    this.#emit("error");
  }

  #emit(name: string): void {
    for (const listener of this.#listeners.get(name) ?? []) listener({});
  }
}

const events = {
  status(_status: ConnectionStatus, _detail?: string): void {},
  greeted(): void {},
  topic(): void {},
  generationMismatch(): void {},
};

/** The token source records what it was asked and answers in order. */
function source(answers: (string | undefined)[]): {
  asked: boolean[];
  next: (renew: boolean) => Promise<string | undefined>;
} {
  const asked: boolean[] = [];
  return {
    asked,
    next: (renew: boolean) => {
      asked.push(renew);
      return Promise.resolve(answers[asked.length - 1]);
    },
  };
}

/** Let the awaits inside an attempt run out. */
const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 0));

let original: unknown;

beforeEach(() => {
  original = (globalThis as { WebSocket?: unknown }).WebSocket;
  (globalThis as { WebSocket?: unknown }).WebSocket = FakeSocket;
  FakeSocket.instances.length = 0;
});

afterEach(() => {
  (globalThis as { WebSocket?: unknown }).WebSocket = original;
});

describe("a refused handshake is answered by renewing the token, once", () => {
  test("the next attempt asks for a new token and dials straight back", async () => {
    const token = source(["stale", "standing", "standing", "renewed"]);
    const connection = new Connection(events);
    connection.connect("ws://instance.example/ws", token.next);
    await settle();

    const first = FakeSocket.instances[0] as FakeSocket;
    expect(first.protocols).toEqual(["ccmsg.v1", "ccmsg.token.stale"]);
    first.refuse();
    await settle();

    // No wait between the two: the retry is not a backoff, it is the same
    // attempt made with the token the family actually stands on.
    expect(token.asked).toEqual([false, true]);
    const second = FakeSocket.instances[1] as FakeSocket;
    expect(second.protocols).toEqual(["ccmsg.v1", "ccmsg.token.standing"]);

    // Being admitted settles the question, so a refusal on a later attempt is
    // asked again rather than counted as a second refusal of the same token.
    second.admit();
    await settle();
    second.close();
    await new Promise((done) => setTimeout(done, 600));
    const third = FakeSocket.instances[2] as FakeSocket;
    expect(token.asked).toEqual([false, true, false]);
    third.refuse();
    await settle();
    expect(token.asked).toEqual([false, true, false, true]);
    connection.close();
  });

  test("refusals that keep coming back off, and keep asking for a token", async () => {
    // The immediate retry is spent while the endpoint is unreachable, which is
    // a refusal that no token answers. What comes back must still be able to
    // renew, or the page is left presenting a superseded token for good.
    const token = source(["stale", "stale", "standing"]);
    const connection = new Connection(events);
    connection.connect("ws://instance.example/ws", token.next);
    await settle();
    (FakeSocket.instances[0] as FakeSocket).refuse();
    await settle();
    (FakeSocket.instances[1] as FakeSocket).refuse();
    await settle();

    // Delayed rather than immediate, and asking for a renewal all the same.
    expect(FakeSocket.instances.length).toBe(2);
    await new Promise((done) => setTimeout(done, 600));
    expect(token.asked).toEqual([false, true, true]);
    const third = FakeSocket.instances[2] as FakeSocket;
    expect(third.protocols).toEqual(["ccmsg.v1", "ccmsg.token.standing"]);
    connection.close();
  });

  test("a refusal the refresh cannot answer stops at the sign-in screen", async () => {
    // Nothing to present is what a source with no session answers, and dialling
    // on that would be a busy loop against a door that authenticating opens.
    const token = source(["stale", undefined]);
    const said: (string | undefined)[] = [];
    const connection = new Connection({
      ...events,
      status: (status: ConnectionStatus, detail?: string) => said.push(detail ?? status),
    });
    connection.connect("ws://instance.example/ws", token.next);
    await settle();
    (FakeSocket.instances[0] as FakeSocket).refuse();
    await settle();

    expect(token.asked).toEqual([false, true]);
    expect(FakeSocket.instances.length).toBe(1);
    expect(said.at(-1)).toBe("認証が必要です");
    connection.close();
  });
});

describe("dialling again drops the socket that was there", () => {
  test("the old socket is closed and its close does not touch the new one", async () => {
    const token = source(["one", "two"]);
    const connection = new Connection(events);
    connection.connect("ws://instance.example/ws", token.next);
    await settle();
    const first = FakeSocket.instances[0] as FakeSocket;
    first.admit();

    connection.connect("ws://elsewhere.example/ws", token.next);
    await settle();
    expect(first.closed).toBe(true);
    const second = FakeSocket.instances[1] as FakeSocket;
    expect(second.url).toBe("ws://elsewhere.example/ws");

    // The old socket's close arrives after the new one is current, and is not
    // this connection's business any more: no retry, no third socket.
    first.close();
    await settle();
    expect(FakeSocket.instances.length).toBe(2);
    connection.close();
  });
});
