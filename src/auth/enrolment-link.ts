import { EnrollClaims, isValid } from "@ccmsg/protocol";
import { fromBase64Url } from "./base64url.ts";

/** What `ccmsg user create` and `ccmsg user add --enroll` hand a person: a
 * link, and six digits the link never carries.
 *
 * The token rides in the fragment because a fragment is not sent to the server
 * that serves this page (the page's origin is not the instance's), so the one
 * place it is read is here. The digits are typed in from the terminal — a
 * leaked link is not an enrolment, which only holds while the two halves travel
 * apart (contract DR-0021).
 *
 * The two purposes a link may carry are told apart by the claims and not by
 * this page: making the person (`create_user`, which makes a passkey) and
 * handing them an instance they do not have yet (`add_owner`, which asserts one
 * they already hold). */

export interface Enrolment {
  /** The whole token, opaque to this page and to every instance but its
   * issuer. Sent back as it arrived. */
  readonly token: string;
  /** What the token says, read for display alone. Nothing here is trusted:
   * the issuing instance verifies its own signature, and this page shows the
   * person what they are about to do so they can refuse it. */
  readonly claims: EnrollClaims;
}

/** A link this page cannot act on, and the words to say so with.
 *
 * Told apart from "no link at all" because the two call for different things:
 * one is an ordinary page load, and the other is a person who was handed a URL,
 * opened it, and would otherwise watch nothing happen. */
export interface RefusedLink {
  readonly refused: string;
}

export type EnrolmentLink = Enrolment | RefusedLink;

export function isRefused(link: EnrolmentLink): link is RefusedLink {
  return "refused" in link;
}

/** Why a link is not one to act on, in the one wording there is.
 *
 * Unreadable claims, a spent URL and an issuer nobody can reach are one answer
 * and not three. Which it was is not this page's to say and not worth saying:
 * telling somebody that the URL was real but used is telling them the URL was
 * real (contract issue `registration-url-checked-before-the-form`). */
const UNUSABLE = "この URL は使えません。CLI で発行し直してください。";

/** Read `#enroll=<token>` out of a location fragment.
 *
 * A fragment naming nothing this page answers for is not a link at all and is
 * passed over. The one exception is `#register=`, which this contract does not
 * speak: somebody holding one was handed a URL and opened it, and silence would
 * leave them pressing it again, so it meets the same words as any other URL
 * that cannot be used. */
export function parseEnrolmentFragment(hash: string): EnrolmentLink | undefined {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const token = params.get("enroll");
  if (token === null || token === "") {
    return params.get("register") === null ? undefined : { refused: UNUSABLE };
  }
  const claims = readClaims(token);
  return claims === undefined ? { refused: UNUSABLE } : { token, claims };
}

/** The address bar, as far as an enrolment link needs it. */
export interface EnrolmentLinkPage {
  /** The fragment as it stands now. */
  readonly hash: () => string;
  /** Drop the fragment, keeping the route it was hung on: a token is spent
   * where it is read, and the address left behind is one that can be shared or
   * reloaded. */
  readonly clearHash: () => void;
  readonly onHashChange: (react: () => void) => void;
}

/** Take what a fragment carries, now and each time another one arrives.
 *
 * A link opened in a tab already showing this page changes the fragment and
 * nothing else — no load, no navigation — so the same reading has to run on
 * `hashchange` as on arrival, or the link would look like it did nothing. */
export function watchEnrolmentLinks(
  page: EnrolmentLinkPage,
  hold: (held: EnrolmentLink) => void,
): void {
  const take = (): void => {
    const hash = page.hash();
    if (hash === "") return;
    const held = parseEnrolmentFragment(hash);
    page.clearHash();
    if (held !== undefined) hold(held);
  };
  take();
  page.onHashChange(take);
}

/** The claims inside an enrolment token.
 *
 * Read without verifying anything, and only for what the page displays. The
 * signature is checked by the instance that made the token, whose secret never
 * left it; a page that checked what it can read here would be checking a
 * caller's own claim about a caller's own token. */
export function readClaims(token: string): EnrollClaims | undefined {
  const segments = token.split(".");
  if (segments[1] === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(segments[1])));
  } catch {
    return undefined;
  }
  return isValid(EnrollClaims, parsed) ? (parsed as EnrollClaims) : undefined;
}
