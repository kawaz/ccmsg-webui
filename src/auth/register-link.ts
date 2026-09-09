import { isValid, RegisterClaims } from "@ccmsg/protocol";
import { fromBase64Url } from "./base64url.ts";

/** What `ccmsg daemon passkey add` hands a person: a link, and six digits it
 * never puts in the link.
 *
 * The token rides in the fragment because a fragment is not sent to the server
 * that serves this page (the web UI's origin is not the instance's), so the one
 * place it is read is here. The digits are typed in from the terminal — a
 * leaked link is not a registration, which only holds while the two halves
 * travel apart. */

export interface Registration {
  /** The whole token, opaque to this page and to every instance but its
   * issuer. Sent back as it arrived. */
  readonly token: string;
  /** What the token says, read for display alone. Nothing here is trusted:
   * the issuing instance verifies its own signature, and this page shows the
   * person what they are about to register so they can refuse it. */
  readonly claims: RegisterClaims;
}

/** Read `#register=<token>` out of a location fragment. */
export function parseRegisterFragment(hash: string): Registration | undefined {
  const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const token = params.get("register");
  if (token === null || token === "") return undefined;
  const claims = readClaims(token);
  return claims === undefined ? undefined : { token, claims };
}

/** The claims inside a registration token.
 *
 * Read without verifying anything, and only for what the page displays. The
 * signature is checked by the instance that made the token, whose secret never
 * left it; a page that checked what it can read here would be checking a
 * caller's own claim about a caller's own token. */
export function readClaims(token: string): RegisterClaims | undefined {
  const segments = token.split(".");
  if (segments[1] === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(segments[1])));
  } catch {
    return undefined;
  }
  return isValid(RegisterClaims, parsed) ? (parsed as RegisterClaims) : undefined;
}
