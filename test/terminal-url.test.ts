import { describe, expect, test } from "bun:test";
import { terminalEmbedUrl, terminalUrl } from "../src/terminal-url.ts";

const GATEWAY = "https://gateway.example/hyoui";
const ID = "run-87860-c959d6a0";

describe("where a session's terminal is opened", () => {
  test("the gateway's own path is kept and the session hangs below it", () => {
    expect(terminalUrl(GATEWAY, ID)).toBe(`${GATEWAY}/sessions/${ID}`);
    expect(terminalUrl("https://gateway.example", ID)).toBe(
      `https://gateway.example/sessions/${ID}`,
    );
  });

  test("a base that arrives with a trailing slash names the same gateway", () => {
    expect(terminalUrl(`${GATEWAY}/`, ID)).toBe(`${GATEWAY}/sessions/${ID}`);
    expect(terminalUrl("https://gateway.example/", ID)).toBe(
      `https://gateway.example/sessions/${ID}`,
    );
  });

  test("the embedded one asks for the terminal alone, sized by its frame", () => {
    expect(terminalEmbedUrl(GATEWAY, ID)).toBe(`${GATEWAY}/sessions/${ID}?embed=1&resize=1`);
  });

  test("an id is written as one segment rather than as more of the path", () => {
    expect(terminalUrl(GATEWAY, "a/b?c")).toBe(`${GATEWAY}/sessions/a%2Fb%3Fc`);
  });

  test("nothing is made from a gateway a browser cannot open", () => {
    expect(terminalUrl("file:///tmp/x", ID)).toBeNull();
    expect(terminalUrl("javascript:alert(1)", ID)).toBeNull();
    expect(terminalUrl("ws://gateway.example", ID)).toBeNull();
    expect(terminalUrl("not a url", ID)).toBeNull();
    expect(terminalEmbedUrl("file:///tmp/x", ID)).toBeNull();
  });

  test("nothing is made where either half is missing", () => {
    expect(terminalUrl(undefined, ID)).toBeNull();
    expect(terminalUrl(GATEWAY, undefined)).toBeNull();
    expect(terminalUrl(GATEWAY, "")).toBeNull();
    expect(terminalUrl("", ID)).toBeNull();
    expect(terminalEmbedUrl(undefined, undefined)).toBeNull();
  });
});
