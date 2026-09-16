import { describe, expect, test } from "bun:test";
import { type AuthSession, isValid, originOf, rpIdOf, WebUi } from "@ccmsg/protocol";
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
  isRefused,
  parseRegisterFragment,
  type RegisterLink,
  type Registration,
  readClaims,
  watchRegisterLinks,
} from "../src/auth/register-link.ts";

/** What a fragment held, as a registration. Fails the test rather than
 * narrowing quietly: a refusal read as a registration would pass assertions
 * about fields nobody looked at. */
function registrationOf(link: RegisterLink | undefined): Registration {
  if (link === undefined || isRefused(link)) throw new Error(`登録ではありません: ${String(link)}`);
  return link;
}

function token(claims: Record<string, unknown>): string {
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  return `header.${body}.signature`;
}

const CLAIMS = {
  iss: "0123456789abcdef0123456789abcdef",
  sub: "main-1",
  unit: "main",
  endpoint: "http://localhost:5173/",
  webui: "https://ui.example/ccmsg/",
  expires_at: 1_800_000_000_000,
  jti: "one",
  user_id: "AAAABBBBCCCCDDDD",
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
    // wider than its `WebUi`: an instance is reached over plain HTTP and at an
    // address literal, while the page making a credential needs a secure
    // context and a relying party that is a domain. The two are narrowed for
    // different reasons, so the bar does not borrow the ceremony's rule.
    expect(isEndpoint("http://192.0.2.9:8080/")).toBe(true);
    expect(isValid(WebUi, "http://192.0.2.9:8080/")).toBe(false);
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

describe("the registration link", () => {
  test("the fragment carries the token, and the claims are read for display", () => {
    const one = registrationOf(parseRegisterFragment(`#register=${token(CLAIMS)}`));
    expect(one.claims.sub).toBe("main-1");
    expect(one.claims.endpoint).toBe("http://localhost:5173/");
    expect(one.token).toBe(token(CLAIMS));
  });

  test("the link names the web UI as well as the instance, and they are not one URL", () => {
    // The two answer different questions: which instance the credential admits
    // its holder to, and which page it may be presented from (contract
    // DR-0029). The relying party and the origin are read off the second.
    const one = registrationOf(parseRegisterFragment(`#register=${token(CLAIMS)}`));
    expect(one.claims.webui).toBe("https://ui.example/ccmsg/");
    expect(rpIdOf(one.claims.webui)).toBe("ui.example");
    expect(originOf(one.claims.webui)).toBe("https://ui.example");
  });

  test("a web UI no ceremony could run at is refused in words, not in silence", () => {
    // The contract admits https, http on the loopback names a browser trusts,
    // and no address literal, because that is what a secure context and a
    // relying party that is a domain come to (contract `WebUi`). A person was
    // handed this URL and opened it, so the page says why it cannot be used.
    for (const webui of ["http://ui.example/", "https://198.51.100.9/"]) {
      const link = parseRegisterFragment(`#register=${token({ ...CLAIMS, webui })}`);
      if (link === undefined || !isRefused(link)) throw new Error(`拒否されていません: ${webui}`);
      expect(link.refused).toContain(webui);
      expect(link.refused).toContain("https");
    }
  });

  test("a loopback web UI is what makes a development machine work", () => {
    const one = registrationOf(
      parseRegisterFragment(`#register=${token({ ...CLAIMS, webui: "http://localhost:5173/" })}`),
    );
    expect(one.claims.webui).toBe("http://localhost:5173/");
  });

  test("a token that is not one at all says so without naming a URL", () => {
    const link = parseRegisterFragment("#register=not.a.token");
    if (link === undefined || !isRefused(link)) throw new Error("拒否されていません");
    expect(link.refused).toContain("発行し直して");
  });

  test("claims that name no web UI are not the contract's shape", () => {
    const { webui: _dropped, ...without } = CLAIMS;
    expect(readClaims(token(without))).toBeUndefined();
  });

  test("a fragment naming no registration is not one", () => {
    expect(parseRegisterFragment("#other=value")).toBeUndefined();
    expect(parseRegisterFragment("")).toBeUndefined();
  });

  test("a token whose claims are not the contract's shape is refused", () => {
    // Read for display alone, and still checked: a shape this page cannot
    // display is not something to display half of.
    expect(readClaims(token({ sub: "main-1" }))).toBeUndefined();
    expect(readClaims("not.a.token")).toBeUndefined();
    expect(readClaims("single-segment")).toBeUndefined();
  });
});

describe("why a refresh is being asked for", () => {
  const SESSION = {
    sub: "main-1",
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

describe("a registration link arriving in an open tab", () => {
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

  test("a fragment that arrives after load starts the same registration", () => {
    const held: RegisterLink[] = [];
    const tab = page("");
    watchRegisterLinks(tab.port, (one) => held.push(one));
    expect(held).toHaveLength(0);

    tab.arrive(`#register=${token(CLAIMS)}`);
    expect(held).toHaveLength(1);
    expect(registrationOf(held[0]).claims.sub).toBe("main-1");
    // The token is spent where it is read, so the address bar is left shareable.
    expect(tab.state.hash).toBe("");
    expect(tab.state.cleared).toBe(1);
  });

  test("a fragment present at load is taken without waiting for a change", () => {
    const held: RegisterLink[] = [];
    const tab = page(`#register=${token(CLAIMS)}`);
    watchRegisterLinks(tab.port, (one) => held.push(one));
    expect(held).toHaveLength(1);
    expect(tab.state.hash).toBe("");
  });

  test("a fragment naming no registration still clears, and holds nothing", () => {
    const held: RegisterLink[] = [];
    const tab = page("#other=value");
    watchRegisterLinks(tab.port, (one) => held.push(one));
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
