import { STATUS_SID } from "./fixture.ts";
import { expect, shot, test } from "./harness.ts";

/** 動いていないセッションを探す。
 *
 * 探すのは instance で、読むのはその host の file — fixture の transcript が
 * そのまま探索の対象になるので、作り物は「何を打ったか」だけ。
 *
 * 名前が `screens` の後ろに来るのは順番のため (一覧の画面に畳んだ入口が増える
 * ので、開いた姿はこちらで撮る)。 */

test("打った言葉で過去の transcript が見つかり、押すと開く", async ({ ui: page, instance }) => {
  await page.goto(instance.endpoint);
  // 畳みの取っ手を押して開く (既定は閉じている — 主役は開いている一覧の方)。
  await page.getByText("動いていないセッションを探す").click();
  await page.getByRole("searchbox", { name: "探す言葉" }).fill("束 0");
  await page.getByRole("button", { name: "探す" }).click();

  // 当たった行。fixture の道具の呼びを持つセッションが出る。
  const hit = page.locator(".hit").first();
  await expect(hit).toBeVisible();
  await expect(hit.locator(".hit-text").first()).toContainText("束 0");
  await shot(page, "session-search.png");

  // 押すとその transcript が開く。動いていないセッションでも読めるのは、
  // transcript を読む op が sid で答えるから。
  await hit.getByRole("button").first().click();
  await expect(page).toHaveURL(new RegExp(`/s/${STATUS_SID}/timeline$`));
  await expect(page.getByRole("heading", { name: /transcript — / })).toBeVisible();
});

test("見つからない時は、次にどうするかを言う", async ({ ui: page, instance }) => {
  await page.goto(instance.endpoint);
  // 畳みの取っ手を押して開く (既定は閉じている — 主役は開いている一覧の方)。
  await page.getByText("動いていないセッションを探す").click();
  await page.getByRole("searchbox", { name: "探す言葉" }).fill("ここには無い言葉");
  await page.getByRole("button", { name: "探す" }).click();
  await expect(page.getByText("見つかりませんでした")).toBeVisible();
});
