import type { AuthChallenge, AuthRegisterArgs, AuthSession, RegisterClaims } from "@ccmsg/protocol";
import { bufferOf, toBase64Url } from "./base64url.ts";
import { type AuthRoute, authUrl } from "./endpoint.ts";

/** The four HTTP routes an instance answers before a connection exists, and the
 * two calls to the authenticator that sit between them.
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
      // The instance is on an origin of its own, so the refresh cookie only
      // travels when it is asked for by name.
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

/** Make a passkey for what a registration URL authorized, and spend the URL.
 *
 * The challenge is fetched from the endpoint being registered for, and travels
 * back beside the credential with the instance that can spend it: behind a load
 * balancer the one that issued it, the one that made the URL and the one
 * receiving this may all be different (contract `AuthRegisterArgs`). */
export async function registerPasskey(options: {
  token: string;
  claims: RegisterClaims;
  code: string;
  deviceLabel?: string;
}): Promise<AuthSession> {
  const { claims } = options;
  const challenge = await fetchChallenge(claims.endpoint);
  const created = await navigator.credentials.create({
    publicKey: {
      challenge: bufferOf(challenge.challenge),
      rp: { id: claims.rp_id, name: claims.unit },
      user: {
        // The handle the issuing instance settled on for this subject: a second
        // value for one person would be a second account on their device.
        id: bufferOf(claims.user_id),
        name: claims.sub,
        displayName: options.deviceLabel === undefined ? claims.sub : options.deviceLabel,
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
    challenge,
    credential: registrationCredential(created as PublicKeyCredential),
  };
  return (await post(
    claims.endpoint,
    "register",
    args as unknown as Record<string, unknown>,
  )) as unknown as AuthSession;
}

/** Prove a registered passkey and get a session.
 *
 * No credential is named: a resident passkey answers with the handle it was
 * made against, and which subject that is is the instance's to look up. */
export async function assertPasskey(endpoint: string, rpId?: string): Promise<AuthSession> {
  const challenge = await fetchChallenge(endpoint);
  const got = await navigator.credentials.get({
    publicKey: {
      challenge: bufferOf(challenge.challenge),
      ...(rpId === undefined ? {} : { rpId }),
      userVerification: "required",
    },
  });
  if (got === null) throw new AuthError("aborted", "passkey が提示されませんでした", 0);
  const credential = got as PublicKeyCredential;
  const answer = credential.response as AuthenticatorAssertionResponse;
  const handle = answer.userHandle;
  return (await post(endpoint, "assert", {
    credential: {
      raw_id: toBase64Url(credential.rawId),
      client_data_json: toBase64Url(answer.clientDataJSON),
      authenticator_data: toBase64Url(answer.authenticatorData),
      signature: toBase64Url(answer.signature),
      ...(handle === null ? {} : { user_handle: toBase64Url(handle) }),
    },
    challenge,
  })) as unknown as AuthSession;
}

/** Trade the refresh cookie for a new access token.
 *
 * Takes no arguments: the cookie is the browser's to send, and a page that
 * could state the value is a page that could read it. */
export async function refreshSession(endpoint: string): Promise<AuthSession> {
  return (await post(endpoint, "refresh", {})) as unknown as AuthSession;
}
