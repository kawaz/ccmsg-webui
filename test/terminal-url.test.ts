import { describe, expect, test } from "bun:test";
import { terminalEmbedUrl, terminalUrl } from "../src/terminal-url.ts";

const GATEWAY = "https://gateway.example/hyoui";
const HANDLE = "hyoui:run-87860-c959d6a0";
const ID = "run-87860-c959d6a0";

describe("where a session's terminal is opened", () => {
  test("the gateway's own path is kept and the session hangs below it", () => {
    expect(terminalUrl(GATEWAY, HANDLE)).toBe(`${GATEWAY}/sessions/${ID}`);
    expect(terminalUrl("https://gateway.example", HANDLE)).toBe(
      `https://gateway.example/sessions/${ID}`,
    );
  });

  test("a base that arrives with a trailing slash names the same gateway", () => {
    expect(terminalUrl(`${GATEWAY}/`, HANDLE)).toBe(`${GATEWAY}/sessions/${ID}`);
    expect(terminalUrl("https://gateway.example/", HANDLE)).toBe(
      `https://gateway.example/sessions/${ID}`,
    );
  });

  test("the embedded one asks for the terminal alone, sized by its frame", () => {
    expect(terminalEmbedUrl(GATEWAY, HANDLE)).toBe(`${GATEWAY}/sessions/${ID}?embed=1&resize=1`);
  });

  test("a handle the gateway does not serve is opened by whoever knows it, not here", () => {
    expect(terminalUrl(GATEWAY, ID)).toBeUndefined();
    expect(terminalUrl(GATEWAY, "tmux:%17")).toBeUndefined();
    expect(terminalEmbedUrl(GATEWAY, "tmux:%17")).toBeUndefined();
  });

  test("nothing is made from a gateway a browser cannot open", () => {
    expect(terminalUrl("file:///tmp/x", HANDLE)).toBeUndefined();
    expect(terminalUrl("javascript:alert(1)", HANDLE)).toBeUndefined();
    expect(terminalUrl("ws://gateway.example", HANDLE)).toBeUndefined();
    expect(terminalUrl("not a url", HANDLE)).toBeUndefined();
    expect(terminalEmbedUrl("file:///tmp/x", HANDLE)).toBeUndefined();
  });

  test("nothing is made where either half is missing", () => {
    expect(terminalUrl(undefined, HANDLE)).toBeUndefined();
    expect(terminalUrl(GATEWAY, undefined)).toBeUndefined();
    expect(terminalUrl(GATEWAY, "")).toBeUndefined();
    expect(terminalUrl("", HANDLE)).toBeUndefined();
    expect(terminalEmbedUrl(undefined, undefined)).toBeUndefined();
  });
});
