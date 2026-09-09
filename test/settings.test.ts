import { describe, expect, test } from "bun:test";
import {
  completeEntry,
  isEntryUrl,
  loadEntry,
  parseFragment,
  type Store,
} from "../src/settings.ts";

function store(initial: Record<string, string> = {}): Store & { held: Record<string, string> } {
  const held = { ...initial };
  return {
    held,
    get: (key) => held[key],
    set: (key, value) => {
      held[key] = value;
    },
  };
}

describe("the entry a link may carry", () => {
  test("the fragment names either half", () => {
    expect(parseFragment("#token=abc")).toEqual({ token: "abc" });
    expect(parseFragment("#url=ws://h/ws&token=abc")).toEqual({ url: "ws://h/ws", token: "abc" });
    expect(parseFragment("")).toEqual({});
  });

  test("what the fragment carried is kept, so a reload without it still connects", () => {
    const kept = store();
    expect(loadEntry(kept, "#url=ws://127.0.0.1:1/ws&token=abc")).toEqual({
      url: "ws://127.0.0.1:1/ws",
      token: "abc",
    });
    expect(loadEntry(kept, "")).toEqual({ url: "ws://127.0.0.1:1/ws", token: "abc" });
  });

  test("the fragment wins over what was stored", () => {
    const kept = store({
      "ccmsg.entry.url": "ws://h/ws",
      "ccmsg.entry.token:ws://h/ws": "old",
    });
    expect(loadEntry(kept, "#token=new").token).toBe("new");
  });

  test("a token is kept under the endpoint it belongs to", () => {
    const kept = store();
    loadEntry(kept, "#url=ws://a/ws&token=ta");
    loadEntry(kept, "#url=ws://b/ws&token=tb");
    expect(kept.held["ccmsg.entry.token:ws://a/ws"]).toBe("ta");
    // Going back to the first endpoint answers the first endpoint's token,
    // rather than whichever was configured last.
    expect(loadEntry(kept, "#url=ws://a/ws")).toEqual({ url: "ws://a/ws", token: "ta" });
  });

  test("a token with no endpoint to key it connects this visit and is not kept", () => {
    const kept = store();
    expect(loadEntry(kept, "#token=abc")).toEqual({ url: undefined, token: "abc" });
    expect(kept.held).toEqual({});
  });

  test("a fragment naming an endpoint no socket opens on is ignored", () => {
    const kept = store({ "ccmsg.entry.url": "ws://good/ws" });
    expect(loadEntry(kept, "#url=https://not-a-socket/").url).toBe("ws://good/ws");
  });

  test("a store that remembers nothing still answers what the fragment carried", () => {
    // What a private window looks like: every write is dropped, and the visit
    // still connects on what the link said.
    const forgetful: Store = { get: () => undefined, set: () => undefined };
    expect(loadEntry(forgetful, "#url=ws://h/ws&token=abc")).toEqual({
      url: undefined,
      // Nothing was kept, and what the link carried is still answered.
      token: "abc",
    });
    expect(completeEntry(parseFragment("#url=ws://h/ws&token=abc"))).toEqual({
      url: "ws://h/ws",
      token: "abc",
    });
  });
});

describe("what counts as connectable", () => {
  test("only a websocket scheme", () => {
    expect(isEntryUrl("ws://127.0.0.1:39847/ws")).toBe(true);
    expect(isEntryUrl("wss://ui.example/ws")).toBe(true);
    expect(isEntryUrl("http://127.0.0.1/ws")).toBe(false);
    expect(isEntryUrl("nonsense")).toBe(false);
  });

  test("both halves have to be there", () => {
    expect(completeEntry({ url: "ws://h/ws", token: "t" })).toEqual({
      url: "ws://h/ws",
      token: "t",
    });
    expect(completeEntry({ url: "ws://h/ws" })).toBeUndefined();
    expect(completeEntry({ url: "ws://h/ws", token: "" })).toBeUndefined();
    expect(completeEntry({ token: "t" })).toBeUndefined();
  });
});
