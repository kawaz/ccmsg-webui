import { describe, expect, test } from "bun:test";
import { fromBase64Url, toBase64Url } from "../src/auth/base64url.ts";
import { defaultDeviceLabel } from "../src/auth/device-label.ts";
import { authUrl, endpointFromLocation, isEndpoint, socketUrl } from "../src/auth/endpoint.ts";
import { parseRegisterFragment, readClaims } from "../src/auth/register-link.ts";

function token(claims: Record<string, unknown>): string {
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  return `header.${body}.signature`;
}

const CLAIMS = {
  iss: "0123456789abcdef0123456789abcdef",
  sub: "main-1",
  unit: "main",
  endpoint: "http://localhost:5173/",
  rp_id: "localhost",
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

  test("the page's own address is the endpoint, with the base it was built for", () => {
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
    const held = parseRegisterFragment(`#register=${token(CLAIMS)}`);
    expect(held?.claims.sub).toBe("main-1");
    expect(held?.claims.endpoint).toBe("http://localhost:5173/");
    expect(held?.token).toBe(token(CLAIMS));
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
