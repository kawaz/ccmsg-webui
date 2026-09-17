import { signal } from "@preact/signals";
import type { AuthRefreshReason, AuthSession, Timestamp, UserId } from "@ccmsg/protocol";
import { AuthError } from "./client.ts";

/** What this page holds of a person's session, and nothing else holds.
 *
 * The access token is in memory alone. It is what opens a connection, so it is
 * a secret with a few hours' life, and the store this page could write it to is
 * readable by every script that ever runs on this origin (daemon DR-0001 §2.4). What
 * survives a reload is the refresh cookie, which this page cannot read and does
 * not have to: the instance reads it back. */

export const access = signal<AuthSession["access"] | undefined>(undefined);

/** Who is here: the person, and nothing about where they connected.
 *
 * The same value the authenticator holds as its user handle, which is why one
 * person reaching three instances is one of these and not three (contract
 * DR-0030). What it names is the owner of every drawer this page keeps a
 * session's worth of state in. */
export const user = signal<UserId | undefined>(undefined);

/** When the *connection* stops being authorized, as `hello` and `auth.extend`
 * state it. Not the same as the token's own expiry: a connection opened with a
 * token keeps that deadline until it is moved on the connection itself. */
export const connectionExpiresAt = signal<Timestamp | undefined>(undefined);

/** Set when there is nothing left to connect with and a passkey is what is
 * needed. The screen this raises is the only way back. */
export const needsSignIn = signal(false);

/** Set when asking for a passkey produced none: this authenticator holds none
 * for this page's origin, or whoever is at it declined. A passkey answers for
 * an origin rather than for an instance (contract DR-0030 §2), so what is
 * missing is a passkey made *here*, whichever instance is being dialed.
 * Registering is what is offered then, and not before — it starts at a
 * terminal, and putting it in front of someone who has a passkey is telling
 * them to do work they have already done. */
export const needsRegistration = signal(false);

/** What went wrong the last time this page tried to authenticate, in words for
 * the person. Cleared when they try again. */
export const authProblem = signal<string | undefined>(undefined);

/** Whether a session has been held since this page was loaded. Forgetting one
 * does not unsay it: the page has still been past its first load. */
let everHeld = false;

/** Why a refresh asked for while opening a socket is being asked for.
 *
 * The two look alike from the cookie's side and are not the same thing: a page
 * that has held nothing yet is restoring what the reload lost, and one that has
 * is opening a socket again — because the token ran out, or because the
 * handshake refused it. The refresh a live connection schedules for itself is
 * neither, and says so at its own call site. */
export function connectRefreshReason(): AuthRefreshReason {
  return everHeld ? "reconnect" : "reload";
}

export function holdSession(session: AuthSession): void {
  everHeld = true;
  access.value = session.access;
  user.value = session.user;
  needsSignIn.value = false;
  authProblem.value = undefined;
}

export function forgetSession(): void {
  access.value = undefined;
  user.value = undefined;
  connectionExpiresAt.value = undefined;
}

/** Whether a token is still worth presenting. The margin is what covers the
 * handshake it is about to be used for. */
const EXPIRY_MARGIN_MS = 5_000;

export function tokenIsLive(at = Date.now()): boolean {
  const held = access.value;
  return held !== undefined && held.expires_at - EXPIRY_MARGIN_MS > at;
}

/** Whether a refusal means "no session here" rather than something going
 * wrong. A browser that has never signed in, and one whose refresh token has
 * been spent or revoked, both meet the same answer — and neither is worth
 * putting on screen as an error, because nothing has failed that the person
 * did. */
export function isNoSession(cause: unknown): boolean {
  if (!(cause instanceof AuthError)) return false;
  return (
    cause.status === 401 ||
    cause.status === 403 ||
    cause.code === "auth_invalid" ||
    cause.code === "auth_expired"
  );
}

/** Whether asking for a passkey ended without one.
 *
 * The browser answers the same way whether the person waved the prompt away or
 * has no passkey for this domain at all — on purpose, since telling a page
 * which it was would tell it who is registered here. Both lead to the same
 * place: registering is the way in. */
export function isSignInDeclined(cause: unknown): boolean {
  if (cause instanceof AuthError) return cause.code === "aborted";
  return (
    typeof DOMException !== "undefined" &&
    cause instanceof DOMException &&
    (cause.name === "NotAllowedError" || cause.name === "AbortError")
  );
}

/** What to tell the person about a refusal.
 *
 * The instance's own message says what happened to it; these say what the
 * person can do, which is the part an error code does not carry. */
export function describeAuthError(cause: unknown): string {
  if (!(cause instanceof AuthError)) return String(cause);
  switch (cause.code) {
    // 期限切れ・使用済み・発行元不明を言い分けない。どれだったかを言うことは
    // 「その URL は本物だった」を言うことでもあり、6 桁を間違えた人と使えない
    // URL を渡された人がここで見るものは同じでよい (契約 issue
    // `registration-url-checked-before-the-form`)。
    case "auth_expired":
    case "auth_unknown_issuer":
    case "auth_invalid":
      return "この URL か 6 桁のコードが使えません。CLI で発行し直してください。";
    case "invalid_args":
    case "bad_request":
      return `要求の形が違います: ${cause.message}`;
    case "aborted":
      return cause.message;
    case "unreachable":
      return cause.message;
    default:
      return cause.status === 429
        ? "試行が多すぎます。少し待ってからやり直してください。"
        : `${cause.code}: ${cause.message}`;
  }
}
