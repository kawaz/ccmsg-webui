import { describe, expect, test } from "bun:test";
import {
  isEntryUrl,
  loadEndpoint,
  loadRpId,
  parseFragment,
  saveRpId,
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

describe("the endpoint a link may carry", () => {
  test("the fragment names it", () => {
    expect(parseFragment("#url=ws://h/ws")).toBe("ws://h/ws");
    expect(parseFragment("")).toBeUndefined();
  });

  test("what the fragment carried is kept, so a reload without it still connects", () => {
    const kept = store();
    expect(loadEndpoint(kept, "#url=ws://127.0.0.1:1/ws")).toBe("ws://127.0.0.1:1/ws");
    expect(loadEndpoint(kept, "")).toBe("ws://127.0.0.1:1/ws");
  });

  test("the fragment wins over what was stored", () => {
    const kept = store({ "ccmsg.entry.url": "ws://old/ws" });
    expect(loadEndpoint(kept, "#url=ws://new/ws")).toBe("ws://new/ws");
  });

  test("a fragment naming an endpoint no socket opens on is ignored", () => {
    const kept = store({ "ccmsg.entry.url": "ws://good/ws" });
    expect(loadEndpoint(kept, "#url=https://not-a-socket/")).toBe("ws://good/ws");
  });

  test("a store that remembers nothing still answers what the fragment carried", () => {
    // What a private window looks like: every write is dropped, and the visit
    // still connects on what the link said.
    const forgetful: Store = { get: () => undefined, set: () => undefined };
    expect(loadEndpoint(forgetful, "#url=ws://h/ws")).toBe("ws://h/ws");
  });
});

describe("the relying party a passkey was made under", () => {
  test("is kept per endpoint, because two endpoints may differ in it", () => {
    const kept = store();
    saveRpId(kept, "ws://a/ws", "a.example");
    saveRpId(kept, "ws://b/ws", "example.test");
    expect(loadRpId(kept, "ws://a/ws")).toBe("a.example");
    expect(loadRpId(kept, "ws://b/ws")).toBe("example.test");
    expect(loadRpId(kept, "ws://c/ws")).toBeUndefined();
  });
});

describe("what counts as connectable", () => {
  test("only a websocket scheme", () => {
    expect(isEntryUrl("ws://127.0.0.1:39847/ws")).toBe(true);
    expect(isEntryUrl("wss://ui.example/ws")).toBe(true);
    expect(isEntryUrl("http://127.0.0.1/ws")).toBe(false);
    expect(isEntryUrl("nonsense")).toBe(false);
  });
});
