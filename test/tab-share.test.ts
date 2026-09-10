import { beforeEach, describe, expect, test } from "bun:test";
import type { AuthSession, Subject } from "@ccmsg/protocol";
import { TabShare } from "../src/auth/tab-share.ts";

/** What the person's tabs agree on: one refresh between them, and the access
 * token that comes out of it in all of them.
 *
 * Against stand-ins for the two web APIs, because what is being fixed is the
 * order two tabs do things in — a real lock would only make that harder to
 * state. What the browser actually does with them is the two-tab run in the
 * report. */

/** A channel bus: everything opened under one name hears everything posted to
 * it by anybody else, which is what a BroadcastChannel is. */
class FakeChannel {
  static readonly open = new Map<string, FakeChannel[]>();
  readonly #listeners: ((event: { data: unknown }) => void)[] = [];
  closed = false;

  constructor(readonly name: string) {
    FakeChannel.open.set(name, [...(FakeChannel.open.get(name) ?? []), this]);
  }

  addEventListener(_name: string, listener: (event: { data: unknown }) => void): void {
    this.#listeners.push(listener);
  }

  postMessage(data: unknown): void {
    for (const one of FakeChannel.open.get(this.name) ?? []) {
      if (one === this || one.closed) continue;
      for (const listener of one.#listeners) listener({ data });
    }
  }

  close(): void {
    this.closed = true;
  }
}

/** One lock at a time per name, held until the callback is done. */
function fakeLocks(): LockManager {
  const queues = new Map<string, Promise<unknown>>();
  return {
    request: (name: string, run: unknown) => {
      const held = (queues.get(name) ?? Promise.resolve()).then(() =>
        (run as () => Promise<unknown>)(),
      );
      // The queue advances whether the holder succeeded or not: a refusal
      // releases the lock like anything else does.
      queues.set(
        name,
        held.catch(() => undefined),
      );
      return held;
    },
  } as unknown as LockManager;
}

// Tabs of one test are not tabs of the next: the bus is what the browser tears
// down when a page goes.
beforeEach(() => {
  FakeChannel.open.clear();
});

function session(value: string, expires_at = Date.now() + 60_000, sub = "someone"): AuthSession {
  return { sub: sub as Subject, access: { value, expires_at } };
}

function tab(
  endpoint: string,
  options: {
    sub?: () => Subject | undefined;
    locks?: LockManager;
    session?: () => AuthSession | undefined;
  } = {},
): TabShare {
  const share = new TabShare({
    endpoint,
    subject: options.sub ?? ((): Subject | undefined => "someone" as Subject),
    session: options.session ?? ((): AuthSession | undefined => undefined),
    ...(options.locks === undefined ? {} : { locks: options.locks }),
    channel: (name: string) => new FakeChannel(name) as unknown as BroadcastChannel,
  });
  share.listen(() => {});
  return share;
}

describe("one refresh between the person's tabs", () => {
  test("the tab that waited takes what the tab that ran passed on", async () => {
    const locks = fakeLocks();
    const one = tab("http://h/", { locks });
    const two = tab("http://h/", { locks });
    const ran: string[] = [];

    const first = one.renew(async () => {
      ran.push("one");
      return session("standing");
    });
    const second = two.renew(async () => {
      ran.push("two");
      return session("another");
    });

    expect((await first).access.value).toBe("standing");
    // The second tab held the lock after the first and found the answer
    // already there, so it did not spend a rotation to arrive at the same
    // session.
    expect((await second).access.value).toBe("standing");
    expect(ran).toEqual(["one"]);
  });

  test("what one tab settles on is what the others hold", async () => {
    const locks = fakeLocks();
    const heard: string[] = [];
    const one = tab("http://h/", { locks });
    const two = new TabShare({
      endpoint: "http://h/",
      subject: (): Subject => "someone" as Subject,
      session: (): AuthSession | undefined => undefined,
      locks,
      channel: (name: string) => new FakeChannel(name) as unknown as BroadcastChannel,
    });
    two.listen((shared) => heard.push(shared.access.value));

    await one.renew(async () => session("standing"));
    expect(heard).toEqual(["standing"]);
    expect(two.fresh()?.access.value).toBe("standing");
  });

  test("a token that has run out is not passed on as one to present", async () => {
    const locks = fakeLocks();
    const one = tab("http://h/", { locks });
    const two = tab("http://h/", { locks });
    await one.renew(async () => session("spent", Date.now() - 1));

    // Nothing to reuse, so the tab that asks next refreshes for itself.
    expect(two.fresh()).toBeUndefined();
    const ran: string[] = [];
    await two.renew(async () => {
      ran.push("two");
      return session("standing");
    });
    expect(ran).toEqual(["two"]);
  });

  test("a tab that has just opened asks, and takes what is already held", async () => {
    // Listening is not enough for a tab that was not there when the token was
    // passed around, which is every reloaded tab.
    const locks = fakeLocks();
    const standing = session("standing");
    tab("http://h/", { locks, session: () => standing });
    const opened = tab("http://h/", { locks });
    const ran: string[] = [];

    const got = await opened.renew(async () => {
      ran.push("opened");
      return session("another");
    });
    expect(got.access.value).toBe("standing");
    expect(ran).toEqual([]);
  });

  test("nobody to answer is a tab refreshing for itself", async () => {
    const locks = fakeLocks();
    const alone = tab("http://h/", { locks });
    const ran: string[] = [];
    const got = await alone.renew(async () => {
      ran.push("alone");
      return session("standing");
    });
    expect(got.access.value).toBe("standing");
    expect(ran).toEqual(["alone"]);
  });

  test("without the Web Locks API every tab refreshes for itself", async () => {
    // The behaviour this coordination improves on, not one it needs: the
    // instance keeps the family's access token standing across a rotation.
    const one = tab("http://h/");
    const two = tab("http://h/");
    const ran: string[] = [];
    await one.renew(async () => {
      ran.push("one");
      return session("standing");
    });
    await two.renew(async () => {
      ran.push("two");
      return session("standing");
    });
    expect(ran).toEqual(["one", "two"]);
  });
});

describe("who a tab is coordinating with", () => {
  test("names carry the endpoint and the subject, so strangers do not meet", async () => {
    const locks = fakeLocks();
    const mine = tab("http://h/", { locks });
    const elsewhere = tab("http://h/other/", { locks });
    const another = tab("http://h/", {
      locks,
      sub: (): Subject => "somebody-else" as Subject,
    });

    await mine.renew(async () => session("standing"));
    expect(elsewhere.fresh()).toBeUndefined();
    expect(another.fresh()).toBeUndefined();
    expect([...FakeChannel.open.keys()]).toContain("ccmsg.auth:http://h/:someone");
  });

  test("a tab with no session yet listens on the endpoint alone", () => {
    let sub: Subject | undefined;
    const share = new TabShare({
      endpoint: "http://h/",
      subject: () => sub,
      session: (): AuthSession | undefined => undefined,
      channel: (name: string) => new FakeChannel(name) as unknown as BroadcastChannel,
    });
    share.listen(() => {});
    expect([...FakeChannel.open.keys()]).toContain("ccmsg.auth:http://h/");

    // Learning who this is moves the tab to the name that names them.
    sub = "someone" as Subject;
    share.share(session("standing"));
    expect([...FakeChannel.open.keys()]).toContain("ccmsg.auth:http://h/:someone");
  });
});
