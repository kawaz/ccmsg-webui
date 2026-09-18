import type {
  AssertionCredential,
  AuthChallenge,
  AuthEnrollArgs,
  AuthRefreshReason,
  AuthRegisterArgs,
  AuthSession,
  EnrollClaims,
} from "@ccmsg/protocol";
import { bufferOf, toBase64Url } from "./base64url.ts";
import { type AuthRoute, authUrl } from "./endpoint.ts";

/** The HTTP routes an instance answers outside a connection, and the two calls
 * to the authenticator that sit between them.
 *
 * Nothing here holds a token: what these produce is handed to the caller, and
 * where a session is kept is `session.ts`. */

/** A refusal from an instance, in the contract's own shape.
 *
 * The code is what a caller branches on and the message is the instance's own
 * words; the status is kept because a rate limit answers no body at all. */
export class AuthError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status = status;
  }
}

async function post(
  endpoint: string,
  route: AuthRoute,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let answer: Response;
  try {
    answer = await fetch(authUrl(endpoint, route), {
      method: "POST",
      headers: { "content-type": "application/json" },
      // The instance is a site of its own, which this page's may or may not be.
      // Asking for credentials is what carries the refresh cookie either way:
      // same-site it is an ordinary cookie, and across sites a partitioned one
      // the browser keeps per top-level site (contract DR-0028). The headers
      // the instance holds this exchange to — `Origin`, `Sec-Fetch-Site` — are
      // the browser's to write and this page cannot state them.
      credentials: "include",
      body: JSON.stringify(body),
    });
  } catch (cause) {
    throw new AuthError("unreachable", `instance に届きませんでした: ${String(cause)}`, 0);
  }
  const text = await answer.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  if (!answer.ok) {
    const error = (parsed as { error?: { code?: string; msg?: string } } | undefined)?.error;
    throw new AuthError(
      error?.code ?? `http_${String(answer.status)}`,
      error?.msg ?? (text === "" ? answer.statusText : text),
      answer.status,
    );
  }
  return parsed as Record<string, unknown>;
}

export async function fetchChallenge(endpoint: string): Promise<AuthChallenge> {
  return (await post(endpoint, "challenge", {})) as unknown as AuthChallenge;
}

/** Turn what the browser produced into what the contract carries.
 *
 * The browser's names are camelCase and its values are buffers; this wire is
 * snake_case and base64url, and this page is what maps between the two. */
function registrationCredential(credential: PublicKeyCredential): AuthRegisterArgs["credential"] {
  const answer = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    raw_id: toBase64Url(credential.rawId),
    client_data_json: toBase64Url(answer.clientDataJSON),
    attestation_object: toBase64Url(answer.attestationObject),
  };
}

/** Make a passkey for what an enrolment URL authorized, and spend the URL.
 *
 * One origin is at work rather than two: the ceremony is held at the origin the
 * claims name, which is this page, and the relying party is that origin's host
 * (contract DR-0030 §2). The browser refuses a relying party that is not this
 * page's own domain, and the instance compares the same host from the other
 * side, so it is read off `location` rather than out of the claims — a claim
 * the browser would refuse anyway is not a value to build a ceremony from. What
 * the claims say the origin is, is shown to the person instead, who can see
 * that the page they are on is not the one they were sent to.
 *
 * The account name is the person's. The URL carried an administrator's guess at
 * it and the form let them settle it, and it is given to the authenticator as
 * both `name` and `displayName` — a passkey manager keeps the name and shows it
 * wherever the key is listed, and what it keeps is `name`.
 *
 * The challenge is fetched from the endpoint being posted to, and travels back
 * beside the credential with the instance that can spend it: behind a load
 * balancer the one that issued it, the one that made the URL and the one
 * receiving this may all be different (contract `AuthRegisterArgs`). */
export async function registerPasskey(options: {
  token: string;
  claims: Extract<EnrollClaims, { purpose: "create_user" }>;
  code: string;
  displayName: string;
  deviceLabel?: string;
}): Promise<AuthSession> {
  const { claims, displayName } = options;
  const challenge = await fetchChallenge(claims.endpoint);
  const created = await navigator.credentials.create({
    publicKey: {
      challenge: bufferOf(challenge.challenge),
      rp: { id: location.hostname, name: "ccmsg" },
      user: {
        // The handle the issuing instance settled on for this person: a second
        // value for one person would be a second account on their device, which
        // nothing here could reach in to merge (contract DR-0030 §1).
        id: bufferOf(claims.user),
        name: displayName,
        displayName,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -8 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
      attestation: "none",
    },
  });
  if (created === null) throw new AuthError("aborted", "passkey が作られませんでした", 0);
  const args: AuthRegisterArgs = {
    token: options.token,
    code: options.code,
    ...(options.deviceLabel === undefined || options.deviceLabel === ""
      ? {}
      : { device_label: options.deviceLabel }),
    ...(displayName === "" ? {} : { display_name: displayName }),
    challenge,
    credential: registrationCredential(created as PublicKeyCredential),
  };
  return (await post(
    claims.endpoint,
    "register",
    args as unknown as Record<string, unknown>,
  )) as unknown as AuthSession;
}

/** What `navigator.credentials.get()` produced, in the contract's spelling. */
function assertionCredential(credential: PublicKeyCredential): AssertionCredential {
  const answer = credential.response as AuthenticatorAssertionResponse;
  const handle = answer.userHandle;
  return {
    raw_id: toBase64Url(credential.rawId),
    client_data_json: toBase64Url(answer.clientDataJSON),
    authenticator_data: toBase64Url(answer.authenticatorData),
    signature: toBase64Url(answer.signature),
    ...(handle === null ? {} : { user_handle: toBase64Url(handle) }),
  };
}

/** Ask the authenticator for a passkey of this page's own domain.
 *
 * No credential is named: a resident passkey answers with the handle it was
 * made against, and which person that is is the instance's to look up. No
 * relying party is named either: a credential is made at an origin and its
 * relying party is that origin's host (contract DR-0030 §2), which is this
 * page's own domain and what the browser assumes when none is stated.
 *
 * `mediation` is how the ask is put. The default one is a prompt the person
 * pressed something to get; `"conditional"` is the offer that stands in the
 * browser's own autofill until they take it, and is what a page shows somebody
 * who has not been here in a while. */
async function getAssertion(
  endpoint: string,
  options: { mediation?: CredentialMediationRequirement; signal?: AbortSignal } = {},
): Promise<{ challenge: AuthChallenge; credential: AssertionCredential }> {
  const challenge = await fetchChallenge(endpoint);
  const got = await navigator.credentials.get({
    publicKey: { challenge: bufferOf(challenge.challenge), userVerification: "required" },
    ...(options.mediation === undefined ? {} : { mediation: options.mediation }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  });
  if (got === null) throw new AuthError("aborted", "passkey が提示されませんでした", 0);
  return { challenge, credential: assertionCredential(got as PublicKeyCredential) };
}

/** Prove a passkey and get a session. */
export async function assertPasskey(
  endpoint: string,
  options: { mediation?: CredentialMediationRequirement; signal?: AbortSignal } = {},
): Promise<AuthSession> {
  const proved = await getAssertion(endpoint, options);
  return (await post(endpoint, "assert", {
    credential: proved.credential,
    challenge: proved.challenge,
  })) as unknown as AuthSession;
}

/** Whether this browser can stand a passkey in its own autofill.
 *
 * Asked rather than assumed: where it is absent the offer is simply not made,
 * and the button beside it is the whole way in. */
export async function canOfferPasskey(): Promise<boolean> {
  const api = globalThis.PublicKeyCredential as
    | { isConditionalMediationAvailable?: () => Promise<boolean> }
    | undefined;
  if (api?.isConditionalMediationAvailable === undefined) return false;
  try {
    return await api.isConditionalMediationAvailable();
  } catch {
    return false;
  }
}

/** Take an instance the person was handed, with the passkey they already have.
 *
 * No credential is made: the person exists, and an instance is not something a
 * passkey is made for (contract DR-0030 §4). The assertion says who is here and
 * the six digits say that they are the one asking for this instance — a synced
 * passkey left unattended would otherwise be enough for somebody else to hand
 * themselves an instance in their name.
 *
 * Succeeds where they already own it, and says nothing about which it was: a
 * refusal would read as a mistyped code to the person, and owning something is
 * not a count (contract DR-0030 §4). */
export async function enrolInstance(options: {
  token: string;
  claims: EnrollClaims;
  code: string;
}): Promise<AuthSession> {
  const { claims } = options;
  const proved = await getAssertion(claims.endpoint);
  const args: AuthEnrollArgs = {
    token: options.token,
    code: options.code,
    challenge: proved.challenge,
    credential: proved.credential,
  };
  return (await post(
    claims.endpoint,
    "enroll",
    args as unknown as Record<string, unknown>,
  )) as unknown as AuthSession;
}

/** Trade the refresh cookie for a new access token.
 *
 * The token itself is not stated: the cookie is the browser's to send, and a
 * page that could state the value is a page that could read it. What is stated
 * is why this page is asking, which nothing on the far side decides by — it is
 * kept for the person reading their own sessions back. */
export async function refreshSession(
  endpoint: string,
  reason: AuthRefreshReason,
): Promise<AuthSession> {
  return (await post(endpoint, "refresh", { reason })) as unknown as AuthSession;
}

/** End the token family this browser's refresh cookie names (contract
 * `auth.signout`).
 *
 * Nothing is stated, for the reason a refresh states no token: the cookie
 * already names the family, and a caller that could state it is a caller that
 * could read it. Nothing comes back either — what the call is for happens
 * beside it, the reply being the only place a HttpOnly cookie can be expired.
 * A page that cleared its own side and left the family standing would sign the
 * person out of nothing, since another tab holding the cookie keeps connecting. */
export async function signOutSession(endpoint: string): Promise<void> {
  await post(endpoint, "signout", {});
}
