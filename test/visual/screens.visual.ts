import { OTHER_SID, SID } from "./fixture.ts";
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
  await expect(page.getByRole("heading", { name: /稼働セッション/ })).toBeVisible();
});

test("sessions", async ({ ui: page, instance }) => {
  await page.goto(instance.endpoint);
  await expect(page.getByRole("heading", { name: /稼働セッション/ })).toBeVisible();
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
  const fold = page.locator("details summary").first();
  await expect(fold).toBeVisible();
  await fold.click();
  await shot(page, "timeline-fold-open.png");
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
