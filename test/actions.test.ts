import { describe, expect, test } from "bun:test";
import { actionOf, isDestructive } from "../src/actions/catalogue.ts";
import { canRun, type Handler, run, runKey, Scope } from "../src/actions/tree.ts";

/** スコープの木と、起動が内側から外へ登る道 (DR-0003 §2.3)。
 *
 * **DOM が 1 つも出てこない**のがこの設計の狙いそのもの — 立っている節は
 * アプリの状態が正なので、「宛先が TL で、選択中のメッセージが無い時に何が
 * 担当するか」は木を組むだけで確かめられる (§4)。 */

function handler(log: string[], name: string, enabled = true): Handler {
  return {
    enabled: () => enabled,
    run: () => log.push(name),
  };
}

/** workspace の下に一覧と tl が並ぶ、§2.2 の木の最小形。 */
function tree() {
  const app = new Scope("app");
  const workspace = new Scope("workspace", app);
  const list = new Scope("session-list", workspace);
  const timeline = new Scope("tl.body", workspace);
  return { app, workspace, list, timeline };
}

describe("起動は内側から外へ登る", () => {
  test("いちばん内側の担当が動いて、そこで止まる", () => {
    const log: string[] = [];
    const { workspace, timeline } = tree();
    workspace.handle("select-next", handler(log, "workspace"));
    timeline.handle("select-next", handler(log, "timeline"));
    expect(run("select-next", timeline)).toBe("ran");
    expect(log).toEqual(["timeline"]);
  });

  test("担当はするが今できない時は上へ流す", () => {
    const log: string[] = [];
    const { workspace, timeline } = tree();
    workspace.handle("select-next", handler(log, "workspace"));
    timeline.handle("select-next", handler(log, "timeline", false));
    expect(run("select-next", timeline)).toBe("ran");
    expect(log).toEqual(["workspace"]);
  });

  test("印の付いたアクションは、できない時に上へ流さず止まる", () => {
    const log: string[] = [];
    const { workspace, list } = tree();
    workspace.handle("session.kill", handler(log, "workspace"));
    list.handle("session.kill", handler(log, "list", false));
    expect(run("session.kill", list)).toBe("stopped");
    expect(log).toEqual([]);
  });

  test("担当が 1 つも無ければ何もしない (打鍵はブラウザへ渡る)", () => {
    const { timeline } = tree();
    expect(run("timeline.select-next", timeline)).toBe("none");
  });

  test("外側の区画に居る間は、内側の担当に届かない", () => {
    const log: string[] = [];
    const { list, timeline } = tree();
    timeline.handle("select-next", handler(log, "timeline"));
    expect(run("select-next", list)).toBe("none");
    expect(log).toEqual([]);
  });
});

describe("押せるかは起こす所と同じ判定から出る", () => {
  test("内側ができなくても、上に動く担当が居れば押せる", () => {
    const log: string[] = [];
    const { workspace, timeline } = tree();
    workspace.handle("select-next", handler(log, "workspace"));
    timeline.handle("select-next", handler(log, "timeline", false));
    expect(canRun("select-next", timeline)).toBe(true);
  });

  test("印の付いたアクションは、内側ができない時点で押せない", () => {
    const log: string[] = [];
    const { workspace, list } = tree();
    workspace.handle("session.kill", handler(log, "workspace"));
    list.handle("session.kill", handler(log, "list", false));
    expect(canRun("session.kill", list)).toBe(false);
  });
});

describe("区画の役としての打鍵", () => {
  test("同じ上下が、宛先の区画によって別の担当に届く", () => {
    const log: string[] = [];
    const { list, timeline } = tree();
    list.bindKey("ArrowDown", "session-list.select-next");
    list.handle("session-list.select-next", handler(log, "list"));
    timeline.bindKey("ArrowDown", "timeline.select-next");
    timeline.handle("timeline.select-next", handler(log, "timeline"));
    expect(runKey("ArrowDown", list)).toBe("ran");
    expect(runKey("ArrowDown", timeline)).toBe("ran");
    expect(log).toEqual(["list", "timeline"]);
  });

  test("内側が結んでいなければ、外側の結びが効く", () => {
    const log: string[] = [];
    const { workspace, timeline } = tree();
    workspace.bindKey("Slash", "workspace.focus-sidebar");
    workspace.handle("workspace.focus-sidebar", handler(log, "workspace"));
    expect(runKey("Slash", timeline)).toBe("ran");
    expect(log).toEqual(["workspace"]);
  });

  test("内側の結び先に担当が居ない打鍵は、外側の結びへ降りる", () => {
    const log: string[] = [];
    const { workspace, timeline } = tree();
    timeline.bindKey("Slash", "timeline.open-search");
    workspace.bindKey("Slash", "session-list.open-search");
    workspace.handle("session-list.open-search", handler(log, "workspace"));
    expect(runKey("Slash", timeline)).toBe("ran");
    expect(log).toEqual(["workspace"]);
  });

  test("どこにも結ばれていない打鍵は何も起こさない", () => {
    const { timeline } = tree();
    expect(runKey("KeyQ", timeline)).toBe("none");
  });
});

describe("降ろすと担当が消える", () => {
  test("区画が画面から消えれば、その担当も消える", () => {
    const log: string[] = [];
    const { timeline } = tree();
    const drop = timeline.handle("timeline.select-next", handler(log, "timeline"));
    drop();
    expect(run("timeline.select-next", timeline)).toBe("none");
  });
});

describe("一覧に並ぶアクション", () => {
  test("切断は 1 つで、印が付いている (DR-0004 §2.6)", () => {
    // 接続 = 認証なので、webui 上の操作は「切断」1 つ。意味は従来のログアウト
    // (失効を頼み、手元を消し、頁を立て直す) で、そちらの綴りは残さない。
    expect(actionOf("app.disconnect")?.title).toBe("切断する");
    expect(isDestructive("app.disconnect")).toBe(true);
    expect(actionOf("app.sign-out")).toBeUndefined();
  });

  test("印が付いているので、できない時に外側へ流れない", () => {
    const log: string[] = [];
    const { app, workspace } = tree();
    app.handle("app.disconnect", handler(log, "app"));
    workspace.handle("app.disconnect", handler(log, "workspace", false));
    expect(run("app.disconnect", workspace)).toBe("stopped");
    expect(log).toEqual([]);
  });

  test("プロンプト入力欄の出し入れが一覧に居る (FAB と打鍵が同じ 1 つを起こす)", () => {
    expect(actionOf("main.open-prompt")?.title).toBe("プロンプト入力欄を出す / しまう");
    expect(isDestructive("main.open-prompt")).toBe(false);
  });
});
