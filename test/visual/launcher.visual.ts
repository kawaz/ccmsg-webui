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

test("手順を選び直すと、欄はその手順の変数に入れ替わる", async ({ ui: page, instance }) => {
  await page.goto(instance.endpoint);
  await page.getByText("セッションを始める").click();
  await page.getByRole("combobox", { name: "手順" }).selectOption("resume");
  await expect(page.getByLabel("SID")).toBeVisible();
  // 前の手順の変数は残らない (名前の合わない値を持ち越さない)。
  await expect(page.getByLabel("NAME")).toHaveCount(0);
});
