import type { AuthSession, Subject } from "@ccmsg/protocol";

/** What the person's open tabs agree on: one refresh at a time, and one access
 * token between them.
 *
 * The access token belongs to the family rather than to a page (DR-0001 §2.4),
 * so two tabs refreshing on their own would each take the token out from under
 * the other. A lock makes the refresh one tab's work, and a channel hands the
 * answer to the rest — in memory, because an access token is a secret with a
 * few hours' life and every store this page could write it to is readable by
 * every script that ever runs on this origin.
 *
 * Names carry the endpoint and, once it is known, the subject: one origin can
 * serve several endpoints, and one endpoint several people, and tabs that are
 * not the same session have nothing to coordinate. */

/** What travels between tabs. The subject rides along because a tab that has
 * only the endpoint's name to listen on cannot read it off the name. */
export interface SharedAccess {
  readonly kind: "access";
  readonly sub: Subject;
  readonly value: string;
  readonly expires_at: number;
}

/** A tab about to refresh, asking whether anybody already holds a token.
 *
 * The answer is what a tab that has just been opened or has just taken the lock
 * needs, and it cannot be had by listening: what was broadcast before this tab
 * was there is gone. */
export interface AskForAccess {
  readonly kind: "ask";
}

type TabMessage = SharedAccess | AskForAccess;

/** How long a tab waits for an answer before deciding it is on its own.
 *
 * A message between tabs of one origin is delivered in well under a
 * millisecond; this is that round trip with room for a busy main thread. It is
 * only ever waited out when no other tab answered, and what it delays then is a
 * refresh that is about to spend a network round trip anyway. */
const ASK_MS = 50;

/** The margin an access token has to have left to be worth passing on: the same
 * question `tokenIsLive` asks, on a value that arrived from elsewhere. */
const EXPIRY_MARGIN_MS = 5_000;

/** The web APIs this leans on, so a test can stand in for them and a browser
 * without the Web Locks API is simply one where `locks` is absent. */
export interface TabShareDeps {
  readonly endpoint: string;
  readonly subject: () => Subject | undefined;
  /** What this tab holds right now, so it can answer another tab's ask. */
  readonly session: () => AuthSession | undefined;
  readonly locks?: LockManager | undefined;
  readonly channel?: (name: string) => BroadcastChannel;
  readonly now?: () => number;
  readonly wait?: (ms: number) => Promise<void>;
}

export class TabShare {
  readonly #deps: TabShareDeps;
  #channel: BroadcastChannel | undefined;
  #name: string | undefined;
  #held: SharedAccess | undefined;
  #listener: ((shared: AuthSession) => void) | undefined;
  /** Set while an ask is outstanding, so the answer ends the wait. */
  #answered: (() => void) | undefined;

  constructor(deps: TabShareDeps) {
    this.#deps = deps;
  }

  /** Hear what other tabs settle on. The channel is opened here and reopened
   * whenever the name changes, which is what learning the subject does. */
  listen(listener: (shared: AuthSession) => void): void {
    this.#listener = listener;
    this.#reopen();
  }

  close(): void {
    this.#channel?.close();
    this.#channel = undefined;
    this.#name = undefined;
  }

  /** The newest access token another tab passed on, while it is still worth
   * presenting. Nothing when this tab has heard nothing, or when what it heard
   * has run out. */
  fresh(): AuthSession | undefined {
    const held = this.#held;
    if (held === undefined) return undefined;
    if (held.expires_at - EXPIRY_MARGIN_MS <= this.#now()) return undefined;
    return { sub: held.sub, access: { value: held.value, expires_at: held.expires_at } };
  }

  /** Refresh as the person's one tab that is doing so.
   *
   * The tab holding the lock asks the others before it refreshes at all: a tab
   * that waited will find that the one before it has already rotated the family,
   * and a tab that has just been opened will find a token it never had to
   * rotate for. Asking rather than only listening is what makes that reliable —
   * the lock and a message are handed over by different queues, so what another
   * tab broadcast may not have arrived yet, and what it broadcast before this
   * tab existed never will.
   *
   * Without the Web Locks API there is no waiting and every tab refreshes for
   * itself. That is the behaviour this coordination improves on, not one it
   * needs: the instance keeps the family's access token standing across a
   * rotation, so tabs that refresh separately still come back to one token. */
  async renew(run: () => Promise<AuthSession>): Promise<AuthSession> {
    const locks = this.#deps.locks;
    if (locks === undefined) return this.#ran(await run());
    return await locks.request(`ccmsg.auth.refresh:${this.#scope()}`, async () => {
      const shared = this.fresh() ?? (await this.#ask());
      if (shared !== undefined) return shared;
      return this.#ran(await run());
    });
  }

  /** Ask the other tabs for a token, and answer with the first one that comes
   * back. Nothing when nobody answers within the round trip — which is what
   * being the only tab of this session looks like. */
  async #ask(): Promise<AuthSession | undefined> {
    this.#reopen();
    const channel = this.#channel;
    if (channel === undefined) return undefined;
    const answered = new Promise<void>((done) => {
      this.#answered = done;
    });
    channel.postMessage({ kind: "ask" } satisfies AskForAccess);
    const wait = this.#deps.wait ?? ((ms: number) => new Promise<void>((go) => setTimeout(go, ms)));
    await Promise.race([answered, wait(ASK_MS)]);
    this.#answered = undefined;
    return this.fresh();
  }

  /** Pass a session this tab settled on to the others. */
  share(session: AuthSession): void {
    const message = this.#messageOf(session);
    this.#held = message;
    this.#reopen();
    this.#channel?.postMessage(message);
  }

  #messageOf(session: AuthSession): SharedAccess {
    return {
      kind: "access",
      sub: session.sub,
      value: session.access.value,
      expires_at: session.access.expires_at,
    };
  }

  #ran(session: AuthSession): AuthSession {
    this.share(session);
    return session;
  }

  #now(): number {
    return (this.#deps.now ?? Date.now)();
  }

  /** The endpoint alone until the subject is known, and both once it is: a tab
   * that has not authenticated yet has no session to be part of, and a tab that
   * has must not share one person's token with another's. */
  #scope(): string {
    const sub = this.#deps.subject();
    return sub === undefined ? this.#deps.endpoint : `${this.#deps.endpoint}:${sub}`;
  }

  #reopen(): void {
    if (this.#listener === undefined) return;
    const name = `ccmsg.auth:${this.#scope()}`;
    if (this.#name === name) return;
    this.#channel?.close();
    this.#name = name;
    const open = this.#deps.channel ?? ((one: string) => new BroadcastChannel(one));
    const channel = open(name);
    channel.addEventListener("message", (event: MessageEvent) => {
      const message = event.data as TabMessage | undefined;
      if (message?.kind === "ask") {
        // Answered from what this tab holds, which is its own session if it has
        // one and otherwise the newest it was passed.
        const held = this.#deps.session() ?? this.fresh();
        if (held !== undefined) channel.postMessage(this.#messageOf(held));
        return;
      }
      if (message?.kind !== "access") return;
      this.#held = message;
      const shared = this.fresh();
      if (shared === undefined) return;
      this.#answered?.();
      this.#listener?.(shared);
    });
    this.#channel = channel;
  }
}
