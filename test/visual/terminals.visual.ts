import { expect, shot, test } from "./harness.ts";
import { PERSON_TERMINAL, STARTING_TERMINAL, TERMINAL_SID } from "./terminals.ts";

/** 端末の画面たち。
 *
 * 出ている 3 行は 3 通りの端末で、どれも同じ一覧に並ぶ (契約 DR-0026): セッション
 * が動いている端末、人が `zsh -i` で開いた端末、そして**起動したのにまだ何も
 * 名乗っていないハーネス**の端末。どれがどれかは行そのものではなく pid の
 * 突き合わせから出るので、絵はその導出の結果を写している。 */

test("terminals", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}terminals`);
  // 端末の一覧は daemon が端末管理に訊いて初めて届く (購読が poll を回す)。
  await expect(page.getByRole("heading", { name: /^起動中のハーネス/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^セッションに属さない端末/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^セッションの端末/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "zsh -i" })).toBeVisible();
  await shot(page, "terminals.png");
});

test("terminal-one", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}terminal/${encodeURIComponent(PERSON_TERMINAL)}`);
  await expect(page.getByRole("heading", { name: "zsh -i" })).toBeVisible();
  // 借りている gateway の画面が枠の中に入っていること。
  await expect(page.frameLocator(".terminal-iframe").getByText(/subscribed/)).toBeVisible();
  await shot(page, "terminal-one.png");
});

// 起動したはずのものが一覧に出てこない時に人が辿る道: セッションの一覧に居る
// 「起動中」の行から、その端末へ。
test("terminal-starting", async ({ ui: page, instance }) => {
  await page.goto(instance.endpoint);
  await expect(page.getByRole("heading", { name: /^起動中 / })).toBeVisible();
  await page.getByRole("link", { name: "claude", exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/terminal/${encodeURIComponent(STARTING_TERMINAL)}$`));
  await expect(page.getByRole("heading", { name: "claude" })).toBeVisible();
  await shot(page, "terminal-starting.png");
});

// セッションの配下に居る端末。タブが出ているのは、そのセッションの run が居る
// 端末が一覧に有るから。
test("terminal", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${TERMINAL_SID}/terminal`);
  await expect(page.frameLocator(".terminal-iframe").getByText(/subscribed/)).toBeVisible();
  await shot(page, "terminal.png");
});
