import { describe, expect, test } from "bun:test";
import type { AuthSession } from "@ccmsg/protocol";
import { fromBase64Url, toBase64Url } from "../src/auth/base64url.ts";
import { AuthError, refreshSession } from "../src/auth/client.ts";
import {
  connectRefreshReason,
  forgetSession,
  holdSession,
  isNoSession,
  isSignInDeclined,
} from "../src/auth/session.ts";
import { defaultDeviceLabel } from "../src/auth/device-label.ts";
import { authUrl, endpointFromLocation, isEndpoint, socketUrl } from "../src/auth/endpoint.ts";
import {
  type Enrolment,
  type EnrolmentLink,
  isRefused,
  parseEnrolmentFragment,
  readClaims,
  watchEnrolmentLinks,
} from "../src/auth/enrolment-link.ts";

/** What a fragment held, as an enrolment. Fails the test rather than narrowing
 * quietly: a refusal read as an enrolment would pass assertions about fields
 * nobody looked at. */
function enrolmentOf(link: EnrolmentLink | undefined): Enrolment {
  if (link === undefined || isRefused(link)) throw new Error(`登録ではありません: ${String(link)}`);
  return link;
}

/** What a fragment refused with, or a failure. */
function refusalOf(link: EnrolmentLink | undefined): string {
  if (link === undefined || !isRefused(link))
    throw new Error(`拒否されていません: ${String(link)}`);
  return link.refused;
}

function token(claims: Record<string, unknown>): string {
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  return `header.${body}.signature`;
}

/** A user id is the WebAuthn user handle itself: sixteen bytes spelled
 * base64url, which is twenty-two characters whose last one carries the four
 * bits that have nowhere to go (contract `UserId`). */
const USER = "AAAAAAAAAAAAAAAAAAAAAA";

/** The URL that makes a person: it settles their handle, and the ceremony it
 * runs makes a passkey. */
const CLAIMS = {
  iss: "0123456789abcdef0123456789abcdef",
  purpose: "create_user",
  instance: "0123456789abcdef0123456789abcdef",
  origin: "https://ui.example",
  endpoint: "http://localhost:5173/",
  expires_at: 1_800_000_000_000,
  jti: "one",
  user: USER,
  display_name: "kawaz",
};

/** The URL that hands somebody an instance: who arrives is the assertion's
 * answer, so no handle is named. */
const ADD_OWNER = {
  iss: "0123456789abcdef0123456789abcdef",
  purpose: "add_owner",
  instance: "fedcba9876543210fedcba9876543210",
  origin: "https://ui.example",
  endpoint: "https://h.example/",
  expires_at: 1_800_000_000_000,
  jti: "two",
};

describe("base64url without padding", () => {
  test("a round trip keeps every byte", () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
  });

  test("no padding and none of the characters a URL would mangle", () => {
    expect(toBase64Url(new Uint8Array([255, 255, 255, 254]))).toBe("_____g");
  });
});

describe("what hangs under an endpoint", () => {
  test("the routes are written after the base URL, prefix and all", () => {
    expect(authUrl("http://localhost:5173/", "challenge")).toBe(
      "http://localhost:5173/auth/challenge",
    );
    expect(authUrl("https://h.example/personal/", "assert")).toBe(
      "https://h.example/personal/auth/assert",
    );
  });

  test("the socket keeps the endpoint's own scheme", () => {
    expect(socketUrl("https://h.example/personal/")).toBe("https://h.example/personal/ws");
    expect(socketUrl("http://localhost:5173/")).toBe("http://localhost:5173/ws");
  });

  test("an endpoint is a base URL: http(s), no route of its own, trailing slash", () => {
    expect(isEndpoint("https://h.example/")).toBe(true);
    expect(isEndpoint("https://h.example/personal/")).toBe(true);
    expect(isEndpoint("https://h.example/personal")).toBe(false);
    expect(isEndpoint("wss://h.example/ws")).toBe(false);
    expect(isEndpoint("nonsense")).toBe(false);
  });

  test("an instance may be dialed where no passkey could ever be made", () => {
    // What the connection bar admits is the contract's `Endpoint`, which is
    // wider than the `Origin` a ceremony is held at: an instance is reached over
    // plain HTTP and at an address literal, while the page making a credential
    // needs a secure context and a relying party that is a domain. The two are
    // narrowed for different reasons, so the bar does not borrow the ceremony's
    // rule — and the two values are never compared with each other (contract
    // DR-0030 §4).
    expect(isEndpoint("http://192.0.2.9:8080/")).toBe(true);
    expect(readClaims(token({ ...CLAIMS, origin: "http://192.0.2.9:8080" }))).toBeUndefined();
  });

  test("the page's own address is what an endpoint is first guessed from", () => {
    expect(endpointFromLocation("http://localhost:5173", "/")).toBe("http://localhost:5173/");
    expect(endpointFromLocation("https://h.example", "/personal/")).toBe(
      "https://h.example/personal/",
    );
    // A base spelled without its slash still names a prefix, not a file.
    expect(endpointFromLocation("https://h.example", "/personal")).toBe(
      "https://h.example/personal/",
    );
  });
});

describe("the enrolment link", () => {
  test("the fragment carries the token, and the claims are read for display", () => {
    const one = enrolmentOf(parseEnrolmentFragment(`#enroll=${token(CLAIMS)}`));
    expect(one.claims.purpose).toBe("create_user");
    expect(one.claims.endpoint).toBe("http://localhost:5173/");
    expect(one.token).toBe(token(CLAIMS));
  });

  test("making a person names the handle the passkey is made against", () => {
    // The issuer settles it rather than the page: a second value for one person
    // would be a second account in their authenticator, which no instance could
    // reach in to merge (contract DR-0030 §1).
    const one = enrolmentOf(parseEnrolmentFragment(`#enroll=${token(CLAIMS)}`));
    if (one.claims.purpose !== "create_user") throw new Error("create_user ではありません");
    expect(one.claims.user).toBe(USER);
    // The name the authenticator is to show, which the form lets them settle.
    expect(one.claims.display_name).toBe("kawaz");
  });

  test("handing over an instance names no handle, because the assertion says who", () => {
    const one = enrolmentOf(parseEnrolmentFragment(`#enroll=${token(ADD_OWNER)}`));
    expect(one.claims.purpose).toBe("add_owner");
    // Stating one anyway is a claim the ceremony was never held to, so the
    // shape refuses it rather than leaving it unread (contract `EnrollClaims`).
    expect(readClaims(token({ ...ADD_OWNER, user: USER }))).toBeUndefined();
  });

  test("one address decides the ceremony, and the endpoint is only where it is posted", () => {
    // The origin is where the person was sent and the only place the passkey may
    // be made; the endpoint may be a load balancer with any instance behind it,
    // and is compared with nothing (contract DR-0030 §4).
    const one = enrolmentOf(parseEnrolmentFragment(`#enroll=${token(ADD_OWNER)}`));
    expect(one.claims.origin).toBe("https://ui.example");
    expect(one.claims.endpoint).toBe("https://h.example/");
  });

  test("an origin no ceremony could be held at is not the contract's shape", () => {
    // https, http on the loopback names a browser trusts, and no address
    // literal: what a secure context and a relying party that is a domain come
    // to (contract `Origin`).
    for (const origin of ["http://ui.example", "https://198.51.100.9"]) {
      expect(readClaims(token({ ...CLAIMS, origin }))).toBeUndefined();
    }
  });

  test("a loopback origin is what makes a development machine work", () => {
    const one = enrolmentOf(
      parseEnrolmentFragment(`#enroll=${token({ ...CLAIMS, origin: "http://localhost:5173" })}`),
    );
    expect(one.claims.origin).toBe("http://localhost:5173");
  });

  test("every URL that cannot be used meets the same words", () => {
    // Which of them it was is not said. Telling somebody the URL was real but
    // spent is telling them the URL was real (contract issue
    // `registration-url-checked-before-the-form`), and a person who mistyped
    // nothing has nothing to do differently either way.
    const nonsense = refusalOf(parseEnrolmentFragment("#enroll=not.a.token"));
    expect(nonsense).toContain("使えません");
    // The spelling this contract does not speak. Silence would leave whoever
    // opened it pressing the link again.
    expect(refusalOf(parseEnrolmentFragment(`#register=${token(CLAIMS)}`))).toBe(nonsense);
    // 期限の切れた URL も同じ帯。理由を区別しない。
    expect(refusalOf(parseEnrolmentFragment(`#enroll=${token(CLAIMS)}`, CLAIMS.expires_at))).toBe(
      nonsense,
    );
  });

  test("期限が切れていればフォームは立たない", () => {
    const before = enrolmentOf(
      parseEnrolmentFragment(`#enroll=${token(CLAIMS)}`, CLAIMS.expires_at - 1),
    );
    expect(before.claims.jti).toBe("one");
    expect(
      refusalOf(parseEnrolmentFragment(`#enroll=${token(CLAIMS)}`, CLAIMS.expires_at + 1)),
    ).toContain("使えません");
  });

  test("a fragment naming no enrolment is not one", () => {
    expect(parseEnrolmentFragment("#other=value")).toBeUndefined();
    expect(parseEnrolmentFragment("")).toBeUndefined();
  });

  test("a token whose claims are not the contract's shape is refused", () => {
    // Read for display alone, and still checked: a shape this page cannot
    // display is not something to display half of.
    const { origin: _dropped, ...without } = CLAIMS;
    expect(readClaims(token(without))).toBeUndefined();
    expect(readClaims(token({ ...CLAIMS, purpose: "something_else" }))).toBeUndefined();
    expect(readClaims("not.a.token")).toBeUndefined();
    expect(readClaims("single-segment")).toBeUndefined();
  });
});

describe("why a refresh is being asked for", () => {
  const SESSION = {
    user: USER,
    access: { value: "token", expires_at: 1_800_000_000_000 },
  } as unknown as AuthSession;

  /** Stand in for the instance and answer one session, keeping what was asked
   * of it. */
  async function asked(run: () => Promise<unknown>): Promise<{ url: string; body: unknown }> {
    const real = globalThis.fetch;
    let seen: { url: string; body: unknown } | undefined;
    globalThis.fetch = ((url: string, init: RequestInit) => {
      seen = { url, body: JSON.parse(String(init.body)) };
      return Promise.resolve(new Response(JSON.stringify(SESSION), { status: 200 }));
    }) as unknown as typeof fetch;
    try {
      await run();
    } finally {
      globalThis.fetch = real;
    }
    if (seen === undefined) throw new Error("nothing was asked of the instance");
    return seen;
  }

  for (const reason of ["reload", "expiring", "reconnect"] as const) {
    test(`${reason} travels as the caller's word and alone`, async () => {
      const seen = await asked(() => refreshSession("http://localhost:5173/", reason));
      expect(seen.url).toBe("http://localhost:5173/auth/refresh");
      // The refresh token is the cookie's to carry, so the reason is the whole
      // of what this page states.
      expect(seen.body).toEqual({ reason });
    });
  }

  test("the page's first token is the reload's, and every later one a reconnect", () => {
    // One test for the whole of a page's life: what is being fixed is an order,
    // and the module holds it the way a loaded page does.
    expect(connectRefreshReason()).toBe("reload");
    holdSession(SESSION);
    expect(connectRefreshReason()).toBe("reconnect");
    // Losing the session does not make the page new again: what follows is
    // still a socket being opened for the second time.
    forgetSession();
    expect(connectRefreshReason()).toBe("reconnect");
  });
});

describe("what to call the device being registered", () => {
  test("a phone is named by itself", () => {
    expect(defaultDeviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe(
      "iPhone",
    );
  });

  test("a desktop is named with the browser, because several are in use at once", () => {
    expect(
      defaultDeviceLabel(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
      ),
    ).toBe("Mac Chrome");
    expect(defaultDeviceLabel("Mozilla/5.0 (Windows NT 10.0) Gecko/20100101 Firefox/130.0")).toBe(
      "Windows Firefox",
    );
  });

  test("something unrecognised still gets a name a person can rewrite", () => {
    expect(defaultDeviceLabel("nothing familiar")).toBe("この端末");
  });
});

describe("an enrolment link arriving in an open tab", () => {
  /** A stand-in address bar: the fragment, and whoever is listening for it. */
  function page(hash: string) {
    const reactors: (() => void)[] = [];
    const state = { hash, cleared: 0 };
    return {
      state,
      arrive(next: string) {
        state.hash = next;
        for (const react of reactors) react();
      },
      port: {
        hash: () => state.hash,
        clearHash: () => {
          state.hash = "";
          state.cleared += 1;
        },
        onHashChange: (react: () => void) => reactors.push(react),
      },
    };
  }

  test("a fragment that arrives after load starts the same enrolment", () => {
    const held: EnrolmentLink[] = [];
    const tab = page("");
    watchEnrolmentLinks(tab.port, (one) => held.push(one));
    expect(held).toHaveLength(0);

    tab.arrive(`#enroll=${token(CLAIMS)}`);
    expect(held).toHaveLength(1);
    expect(enrolmentOf(held[0]).claims.instance).toBe(CLAIMS.instance);
    // The token is spent where it is read, so the address bar is left shareable.
    expect(tab.state.hash).toBe("");
    expect(tab.state.cleared).toBe(1);
  });

  test("a fragment present at load is taken without waiting for a change", () => {
    const held: EnrolmentLink[] = [];
    const tab = page(`#enroll=${token(CLAIMS)}`);
    watchEnrolmentLinks(tab.port, (one) => held.push(one));
    expect(held).toHaveLength(1);
    expect(tab.state.hash).toBe("");
  });

  test("a fragment naming no enrolment still clears, and holds nothing", () => {
    const held: EnrolmentLink[] = [];
    const tab = page("#other=value");
    watchEnrolmentLinks(tab.port, (one) => held.push(one));
    expect(held).toHaveLength(0);
    expect(tab.state.cleared).toBe(1);
  });
});

describe("telling a refusal apart from a screen to raise", () => {
  test("a browser with no session meets a refusal that is not a failure", () => {
    // What `/auth/refresh` answers a browser that has never signed in, and one
    // whose refresh token no longer stands. Neither is worth a banner: nothing
    // the person did went wrong.
    expect(isNoSession(new AuthError("http_403", "Forbidden", 403))).toBe(true);
    expect(isNoSession(new AuthError("http_401", "Unauthorized", 401))).toBe(true);
    expect(isNoSession(new AuthError("auth_invalid", "no", 400))).toBe(true);
    expect(isNoSession(new AuthError("auth_expired", "gone", 400))).toBe(true);
  });

  test("an instance that cannot be reached is not a session being over", () => {
    expect(isNoSession(new AuthError("unreachable", "届きませんでした", 0))).toBe(false);
    expect(isNoSession(new AuthError("internal_error", "boom", 500))).toBe(false);
    expect(isNoSession(new Error("boom"))).toBe(false);
  });

  test("a passkey prompt that produced none is where registering is offered", () => {
    // The browser says the same thing whether it was waved away or has no
    // passkey for this domain, and both lead to the same place.
    expect(isSignInDeclined(new DOMException("declined", "NotAllowedError"))).toBe(true);
    expect(isSignInDeclined(new DOMException("gone", "AbortError"))).toBe(true);
    expect(isSignInDeclined(new AuthError("aborted", "passkey が提示されませんでした", 0))).toBe(
      true,
    );
  });

  test("an instance refusing the assertion is the instance's own words", () => {
    expect(isSignInDeclined(new AuthError("auth_invalid", "no", 400))).toBe(false);
    expect(isSignInDeclined(new AuthError("unreachable", "届きませんでした", 0))).toBe(false);
  });
});
