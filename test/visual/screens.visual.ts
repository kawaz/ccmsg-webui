import { AGENT_ID, OTHER_SID, SID } from "./fixture.ts";
import { expect, shot, test } from "./harness.ts";

/** What the screens look like, screen by screen.
 *
 * Each test draws one screen and nothing else depends on it: the registration
 * every screen after the first two rests on is done in the fixture (see
 * `harness.ts`), so a screen that fails to match fails alone. Playwright is
 * told not to parallelise — one daemon, one dev server, fixed ports. */

test("sign-in", async ({ page, instance }) => {
  // The built-in `page`, not `ui`: what this screen is is a browser that has
  // not registered, and a context of its own is exactly that.
  await page.goto(instance.endpoint);
  await expect(page.getByRole("button", { name: "passkey で認証" })).toBeVisible();
  await shot(page, "sign-in.png");
});

test("register", async ({ ui: page, instance }) => {
  // A registration of its own, because the browser used the fixture's. What is
  // on screen is the same screen; the person it names is the second one this
  // instance has issued a link for.
  const { url } = await instance.passkey();
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "passkey を登録する" })).toBeVisible();
  await shot(page, "register.png");
  // Put the app back in front, so the screens after this one are not drawn
  // behind a registration nobody finished.
  await page.getByRole("button", { name: "やめる" }).click();
  await expect(page.getByRole("heading", { name: /^instance / })).toBeVisible();
});

test("sessions", async ({ ui: page, instance }) => {
  await page.goto(instance.endpoint);
  await expect(page.getByRole("heading", { name: /^instance / })).toBeVisible();
  await expect(page.getByRole("button", { name: /topic の畳み方/ })).toBeVisible();
  await shot(page, "sessions.png");
});

test("timeline", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  await expect(page.getByText("畳んだ値の読み方")).toBeVisible();
  await shot(page, "timeline.png");
});

test("timeline-fold-open", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  // 既定で閉じている畳み (会話でないものの並び) を開く。思考は既定で開いて
  // いるので、そこを押すと閉じる方が写る。
  const fold = page.locator("details.tl-fold > summary").first();
  await expect(fold).toBeVisible();
  await fold.click();
  await expect(page.locator("details.tl-fold[open]").first()).toBeVisible();
  await shot(page, "timeline-fold-open.png");
});

// 型付き item が答えられない唯一の問い — 元の行は何と書いてあったか — を、
// 押した所で取り寄せて出す。分類の甘い item ではこの入口が既定で見えている。
test("timeline-raw-record", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  const raw = page.locator("details.tl-raw > summary").last();
  await expect(raw).toBeVisible();
  await raw.click();
  await expect(page.locator("details.tl-raw[open] pre")).toContainText("uuid");
  await shot(page, "timeline-raw-record.png");
});

// 型ごとの表示属性。並ぶのは組み込みが名乗っている型と、この画面が実際に見た型
// (とその上の型) で、継いでいる値は薄く出る。
test("timeline-display", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  await expect(page.getByText("畳んだ値の読み方")).toBeVisible();
  await page.locator("details.tl-display > summary").click();
  await expect(page.getByRole("row", { name: /system\.unknown/ })).toBeVisible();
  await shot(page, "timeline-display.png");
});

// worker を主語にして開いた画面。並びは sub の面の既定 — 道具がトップ層に
// 1 行ずつ並び、本文は閉じている。
test("timeline-agent", async ({ ui: page, instance }) => {
  // 親から降りる: 起動した所がそのまま入口になっているかを、URL を打つのでは
  // なく押して確かめる。
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  await page.getByRole("link", { name: "この worker を開く" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/agent/${AGENT_ID}/timeline$`));
  await expect(page.getByRole("heading", { name: new RegExp(`worker ${AGENT_ID}`) })).toBeVisible();
  await expect(page.getByText("窓を持つのは")).toBeVisible();
  await shot(page, "timeline-agent.png");
});

test("timeline-search", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  await expect(page.getByText("畳んだ値の読み方")).toBeVisible();
  await page.getByRole("button", { name: "この画面の中を探す" }).click();
  await page.getByRole("textbox", { name: /探す言葉/ }).fill("instance 窓");
  await expect(page.locator("mark.search-hl").first()).toBeVisible();
  await shot(page, "timeline-search.png");
});

test("files-code", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/files?path=src/topic-fold.ts`);
  await expect(page.getByText("isFoldable")).toBeVisible();
  await shot(page, "files-code.png");
});

test("files-markdown", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/files?path=NOTES.md`);
  await expect(page.getByText("読み方のメモ")).toBeVisible();
  await shot(page, "files-markdown.png");
});

test("conversation", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  const composer = page.getByRole("textbox", { name: /送/ }).or(page.locator("textarea").last());
  await composer.fill("この topic の粒度、契約側の表を見て確かめてから直して。");
  await composer.scrollIntoViewIfNeeded();
  await shot(page, "conversation.png");
});

test("notification", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  await expect(page.getByText("畳んだ値の読み方")).toBeVisible();
  // 接続が立っていることを先に確かめる。下の送り直しを、普段は 1 回で終わらせる
  // ため — 立っていない所へ送っても、届く先が無い。
  await expect(page.locator(".bar")).toContainText("接続済み");
  // 送って、出るまで送り直す。`notify` は**保持されない** topic なので、購読が
  // 立つ前や再接続の隙間に投げられた 1 通はそこで失われ、待っても戻ってこない
  // — 取り戻す手段は送り直すことしかない。回数ではなく「出たか」で終わるので、
  // 間隔を勘で決める必要もない。トーストが出す文面は毎回同じなので、2 通目が
  // 出た場合でも写るものは変わらない。
  await expect(async () => {
    await instance.notify(OTHER_SID, "基準画像の置き場が決まりました。");
    await expect(page.locator(".toast")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await shot(page, "notification.png");
});

test("terminal", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${OTHER_SID}/terminal`);
  await shot(page, "terminal.png");
});
