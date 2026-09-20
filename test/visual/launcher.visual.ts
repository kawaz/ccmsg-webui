import { expect, shot, test } from "./harness.ts";

/** セッションを始める画面。
 *
 * 献立は使い捨ての instance の config が持っていて、daemon がそれを答え、走らせ
 * るのも daemon。作り物は「その config に何を書いたか」だけで、欄の並びも走った
 * 結果も本物の道を通っている。
 *
 * 名前が `screens` の後ろに来るのは順番のため (一覧に畳んだ入口が増える)。 */

test("献立どおりに欄が並び、走らせると結果が返る", async ({ ui: page, instance }) => {
  await page.goto(instance.endpoint);
  await page.getByText("セッションを始める").click();

  // 手順は config の並び順。変数も config が名乗った名前のまま出る。
  await expect(page.getByRole("combobox", { name: "手順" })).toHaveValue("new");
  await expect(page.getByLabel("NAME")).toHaveValue("visual");
  // 既定値が複数行の変数は、複数行で書ける欄になる。
  await expect(page.getByLabel("PROMPT")).toHaveValue(/ccmsg subscribe 起動。/);
  await shot(page, "launcher.png");

  await page.getByRole("button", { name: "始める", exact: true }).click();
  // 走らせた結果がそのまま出る (何が起動したかは追いかけない)。
  await expect(page.getByText(/^started visual in /)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("終了コード 0")).toBeVisible();
});

/** 始める場所を木から選ぶ。
 *
 * 絵には写らない (path はこの機械でしか通じない綴りなので、`.launch-cwd` ごと
 * 覆ってある)。写らないものを測るのはここの仕事 — 根を開く・名前で絞る・選ぶと
 * 欄に入る、の 3 つが `dir.tree` の往復を通って動く。 */
test("始める場所を木から選べる", async ({ ui: page, instance }) => {
  await page.goto(instance.endpoint);
  await page.getByText("セッションを始める").click();

  // 根は config の root_dirs。閉じた姿で並ぶので、開くのは人の手。綴りは
  // instance が答えたものを使う — この mac は `/var` を `/private/var` に
  // 解いて答えるので、こちらが組み立てた path とは一致しない。
  const root = page.getByRole("button", { name: /\/repo$/ });
  await expect(root).toBeVisible();
  await page.getByRole("button", { name: /\/repo の下$/ }).click();
  const docs = page.getByRole("button", { name: "docs", exact: true });
  await expect(docs).toBeVisible();

  // 選ぶと欄に入る。走らせる場所はこの欄が答えるので、木は欄への入口。
  await docs.click();
  await expect(page.locator(".launch-cwd > input")).toHaveValue(/\/repo\/docs$/);

  // 絞るのは instance の仕事 (当たった節とその先祖が残る)。当たった所まで
  // 開いた姿で出るので、押してすぐ選べる。
  await page.getByRole("searchbox", { name: "場所を名前で絞る" }).fill("issue");
  await page.getByRole("button", { name: "場所を絞る", exact: true }).click();
  await expect(page.getByRole("button", { name: "issue", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "src", exact: true })).toHaveCount(0);
});

test("手順を選び直すと、欄はその手順の変数に入れ替わる", async ({ ui: page, instance }) => {
  await page.goto(instance.endpoint);
  await page.getByText("セッションを始める").click();
  await page.getByRole("combobox", { name: "手順" }).selectOption("resume");
  await expect(page.getByLabel("SID")).toBeVisible();
  // 前の手順の変数は残らない (名前の合わない値を持ち越さない)。
  await expect(page.getByLabel("NAME")).toHaveCount(0);
});
