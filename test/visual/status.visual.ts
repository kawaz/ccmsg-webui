import { STATUS_SID } from "./fixture.ts";
import { expect, shot, test } from "./harness.ts";

/** セッションが今何をしているか。
 *
 * fixture が持っているのは**道具の呼びと答えだけ**で、状態そのものは書いて
 * いない。畳むのは instance なので、この絵は「transcript → 畳み → topic →
 * 画面」の道が通っていることを見せる。
 *
 * 名前が `screens` の後ろに来るのは順番のため (この画面は自分のセッションを
 * 読むが、tab の並びは一覧の側と共有している)。 */

test("workflow と背後の仕事と TODO が、走っている順に並ぶ", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${STATUS_SID}/status`);
  await expect(page.getByRole("heading", { name: "状態" })).toBeVisible();
  // 走っている workflow。名前は instance が結果から読んだもの。
  await expect(page.getByText("束 0 を片付ける")).toBeVisible();
  // 背後の仕事は 2 つ (監視とコマンド)。
  await expect(page.getByText("just watch の結果を見張る")).toBeVisible();
  await expect(page.getByText("visual を回す")).toBeVisible();
  // TODO は走っているものが先。終わった 1 件は数で言う。
  const todos = page.locator(".status-block").filter({ hasText: "TODO" }).locator(".status-item");
  await expect(todos.first()).toContainText("Status タブの中身を出す");
  await expect(page.getByText("1 件が終わっています。")).toBeVisible();
  await shot(page, "session-status.png");
});

test("繋いでいない間は、状態も畳んだ答えを出さない", async ({ usage: page, instance }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${instance.endpoint}s/${STATUS_SID}/status`);
  await expect(page.getByText("束 0 を片付ける")).toBeVisible();
  await page.getByRole("button", { name: "切断" }).click();
  // 明示的な切断は持ち物を畳むので、状態の画面ごと接続の画面に戻る。
  await expect(page.locator(".row")).toHaveCount(0);
  await expect(page.getByText("束 0 を片付ける")).toHaveCount(0);
  await page.getByRole("button", { name: "接続" }).click();
  await expect(page.getByText("束 0 を片付ける")).toBeVisible();
});

test("書き出すと、instance の host に残った場所が返る", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${STATUS_SID}/status`);
  await expect(page.getByRole("heading", { name: "書き出す" })).toBeVisible();
  // 献立は instance が持っているものだけが並ぶ (自由入力は出さない)。
  await expect(page.getByRole("combobox", { name: "献立" })).toBeVisible();
  await page.getByRole("button", { name: "file に書き出す" }).click();
  // 返るのは場所と、何をどれだけ書いたか。中身は運ばない。
  await expect(page.getByText("instance の host に書きました")).toBeVisible({ timeout: 20_000 });
  // 場所は instance の host のもの (絵では覆う: 走らせた時刻と host の綴りが
  // 入っている)。
  await expect(page.locator(".dump-path")).toContainText(".dump.json");
  await shot(page, "session-dump.png");
});
