import { describe, expect, test } from "bun:test";
import { parseRoute, routePath, visibleTabs } from "../src/route.ts";

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

  test("the terminal is a tab of its own", () => {
    expect(parseRoute(`/s/${SID}/terminal`)).toEqual({ at: "session", sid: SID, tab: "terminal" });
    expect(routePath({ at: "session", sid: SID, tab: "terminal" })).toBe(`/s/${SID}/terminal`);
  });

  test("the terminal tab is offered only where a terminal can be reached", () => {
    expect(visibleTabs(true)).toContain("terminal");
    expect(visibleTabs(false)).not.toContain("terminal");
    // それ以外のタブは、端末に届くかどうかで増えも減りもしない。
    expect(visibleTabs(false)).toEqual(visibleTabs(true).filter((tab) => tab !== "terminal"));
  });

  test("anything else is a 404 rather than a guess", () => {
    expect(parseRoute("/s/not-a-sid").at).toBe("unknown");
    expect(parseRoute(`/s/${SID}/nonsense`).at).toBe("unknown");
    expect(parseRoute("/elsewhere").at).toBe("unknown");
  });

  test("a route makes the path it was read from", () => {
    expect(routePath({ at: "sessions" })).toBe("/");
    expect(routePath({ at: "session", sid: SID, tab: "status" })).toBe(`/s/${SID}/status`);
    expect(parseRoute(routePath({ at: "session", sid: SID, tab: "status" }))).toEqual({
      at: "session",
      sid: SID,
      tab: "status",
    });
  });
});

describe("the grammar under a base", () => {
  const BASE = "/personal/";

  test("the base is stripped before the grammar is read", () => {
    expect(parseRoute("/personal/", "", BASE)).toEqual({ at: "sessions" });
    // A prefix reached without its trailing slash is still the prefix.
    expect(parseRoute("/personal", "", BASE)).toEqual({ at: "sessions" });
    expect(parseRoute(`/personal/s/${SID}/files`, "", BASE)).toEqual({
      at: "session",
      sid: SID,
      tab: "files",
    });
  });

  test("an address outside the base is not a route this build answers for", () => {
    expect(parseRoute(`/s/${SID}/files`, "", BASE)).toEqual({
      at: "unknown",
      path: `/s/${SID}/files`,
    });
    expect(parseRoute("/personalise/s", "", BASE).at).toBe("unknown");
  });

  test("a link is written with the base back on", () => {
    expect(routePath({ at: "sessions" }, BASE)).toBe("/personal/");
    expect(routePath({ at: "session", sid: SID, tab: "status" }, BASE)).toBe(
      `/personal/s/${SID}/status`,
    );
    // A base spelled without its slashes names the same prefix.
    expect(routePath({ at: "session", sid: SID, tab: "status" }, "personal")).toBe(
      `/personal/s/${SID}/status`,
    );
  });

  test("parse and format are each other's inverse under either base", () => {
    for (const base of ["/", BASE]) {
      for (const route of [
        { at: "sessions" },
        { at: "session", sid: SID, tab: "status" },
        { at: "session", sid: SID, tab: "files", path: "src/a.ts", lines: { start: 3, end: 9 } },
      ] as const) {
        const printed = routePath(route, base);
        const cut = printed.indexOf("?");
        const [path, search] =
          cut === -1 ? [printed, ""] : [printed.slice(0, cut), printed.slice(cut)];
        expect(parseRoute(path, search, base)).toEqual(route);
      }
    }
  });

  test("an unknown route keeps the whole address it was asked for", () => {
    const asked = parseRoute("/personal/elsewhere", "", BASE);
    expect(routePath(asked, BASE)).toBe("/personal/elsewhere");
  });
});
