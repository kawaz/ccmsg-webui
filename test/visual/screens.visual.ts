import { OTHER_SID, SID } from "./fixture.ts";
import { expect, shot, test } from "./harness.ts";

/** What the screens look like, screen by screen.
 *
 * One file and one order, because the states run into each other: a browser
 * that has not registered is the sign-in screen, and registering is what turns
 * it into every screen after. Playwright is told not to parallelise (one
 * daemon, one dev server, fixed ports), so the order below is the order they
 * are drawn in. */

test.describe.configure({ mode: "serial" });

test("sign-in", async ({ ui: page, instance }) => {
  await page.goto(instance.endpoint);
  await expect(page.getByRole("button", { name: "passkey で認証" })).toBeVisible();
  await shot(page, "sign-in.png");
});

test("register", async ({ ui: page, instance }) => {
  const { url, code } = await instance.passkey();
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "passkey を登録する" })).toBeVisible();
  await shot(page, "register.png");

  await page.getByLabel("CLI が表示した 6 桁のコード").fill(code);
  await page.getByLabel("この端末の名前").fill("visual runner");
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByRole("heading", { name: "稼働セッション", exact: false })).toBeVisible();
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
  await instance.notify(OTHER_SID, "基準画像の置き場が決まりました。");
  await expect(page.locator(".toast")).toBeVisible();
  await shot(page, "notification.png");
});

test("terminal", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${OTHER_SID}/terminal`);
  await shot(page, "terminal.png");
});
