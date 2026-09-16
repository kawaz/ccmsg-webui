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

  test("a run of a session hangs off its id, after a dot", () => {
    expect(parseRoute(`/s/${SID}.4821/status`)).toEqual({
      at: "session",
      sid: SID,
      pid: 4821,
      tab: "status",
    });
    expect(parseRoute(`/s/${SID}.4821`)).toEqual({
      at: "session",
      sid: SID,
      pid: 4821,
      tab: "timeline",
    });
    expect(routePath({ at: "session", sid: SID, pid: 4821, tab: "timeline" })).toBe(
      `/s/${SID}.4821/timeline`,
    );
  });

  test("what is not a pid is not an address", () => {
    expect(parseRoute(`/s/${SID}.`).at).toBe("unknown");
    expect(parseRoute(`/s/${SID}.0`).at).toBe("unknown");
    expect(parseRoute(`/s/${SID}.x9`).at).toBe("unknown");
    // worker は run ではなくセッションの下にある。
    expect(parseRoute(`/s/${SID}.4821/agent/a471372f2/timeline`).at).toBe("unknown");
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

  // 端末はセッションの持ち物ではないので (契約 DR-0026)、セッションの下ではなく
  // 根の直下に居る。
  test("the terminals are a list of their own, and one terminal an address", () => {
    expect(parseRoute("/terminals")).toEqual({ at: "terminals" });
    expect(routePath({ at: "terminals" })).toBe("/terminals");
    expect(parseRoute("/terminal/hyoui%3A%2517")).toEqual({ at: "terminal", id: "hyoui:%17" });
    expect(routePath({ at: "terminal", id: "hyoui:%17" })).toBe("/terminal/hyoui%3A%2517");
  });

  // 色の見え方はこのブラウザのもので、instance にもセッションにも属さない
  // (DR-0001 §2.5)。だから根の直下に居る。
  test("how colour looks is an address of its own, below no session", () => {
    expect(parseRoute("/settings")).toEqual({ at: "settings" });
    expect(routePath({ at: "settings" })).toBe("/settings");
    expect(parseRoute("/settings/colour").at).toBe("unknown");
  });

  // handle の綴りは端末管理のもので、どの scheme があるかは instance が答える。
  // 文法が見るのは `<scheme>:<handle>` の形だけ。
  test("a segment that names no terminal is not an address", () => {
    expect(parseRoute("/terminal/hyoui").at).toBe("unknown");
    expect(parseRoute("/terminal/hyoui%3A").at).toBe("unknown");
    expect(parseRoute("/terminal/%3A17").at).toBe("unknown");
    expect(parseRoute("/terminal/%zz").at).toBe("unknown");
    expect(parseRoute("/terminal").at).toBe("unknown");
    expect(parseRoute("/terminals/hyoui%3A%2517").at).toBe("unknown");
    // 知らない scheme は文法の外ではない — 開けるかどうかは画面が答える。
    expect(parseRoute("/terminal/tmux%3A0")).toEqual({ at: "terminal", id: "tmux:0" });
  });

  // 親の transcript に出るのは worker への指示と返ってきた答えだけなので、その
  // worker が何を叩いたかは worker を主語にして開く。
  test("an agent below a session is its own address", () => {
    expect(parseRoute(`/s/${SID}/agent/a471372f2/timeline`)).toEqual({
      at: "agent",
      sid: SID,
      agentId: "a471372f2",
    });
    expect(routePath({ at: "agent", sid: SID, agentId: "a471372f2" })).toBe(
      `/s/${SID}/agent/a471372f2/timeline`,
    );
  });

  // timeline しか無い所へ別のタブ名を書いた URL は、黙って timeline に落とさ
  // ない: 送られてきた link が何を指していたかが分からなくなる。
  test("only the timeline is under an agent", () => {
    expect(parseRoute(`/s/${SID}/agent/a471372f2/files`).at).toBe("unknown");
    expect(parseRoute(`/s/${SID}/agent/a471372f2`).at).toBe("unknown");
    expect(parseRoute(`/s/${SID}/agent`).at).toBe("unknown");
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
        { at: "agent", sid: SID, agentId: "a471372f2" },
        { at: "terminals" },
        { at: "terminal", id: "hyoui:%17" },
        { at: "settings" },
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
