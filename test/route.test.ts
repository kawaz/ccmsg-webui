import { describe, expect, test } from "bun:test";
import { parseRoute, routePath } from "../src/route.ts";

const SID = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";

describe("the URL grammar", () => {
  test("the root is the session list", () => {
    expect(parseRoute("/")).toEqual({ at: "sessions" });
    expect(parseRoute("")).toEqual({ at: "sessions" });
  });

  test("a session names its tab, and defaults to the timeline without one", () => {
    expect(parseRoute(`/s/${SID}/files`)).toEqual({ at: "session", sid: SID, tab: "files" });
    expect(parseRoute(`/s/${SID}`)).toEqual({ at: "session", sid: SID, tab: "timeline" });
  });

  test("anything else is a 404 rather than a guess", () => {
    expect(parseRoute("/s/not-a-sid").at).toBe("unknown");
    expect(parseRoute(`/s/${SID}/nonsense`).at).toBe("unknown");
    expect(parseRoute("/elsewhere").at).toBe("unknown");
  });

  test("a route makes the path it was read from", () => {
    expect(routePath({ at: "sessions" })).toBe("/");
    expect(routePath({ at: "session", sid: SID, tab: "status" })).toBe(`/s/${SID}/status`);
    expect(parseRoute(routePath({ at: "session", sid: SID, tab: "rooms" }))).toEqual({
      at: "session",
      sid: SID,
      tab: "rooms",
    });
  });
});
