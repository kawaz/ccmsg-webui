import { expect, listSettled, settledOrder, shot, test } from "./harness.ts";

/** 行の上でできること (留める / 改名 / 終了) の試作。
 *
 * 名前が `screens` の後ろに来るのは順番のため — 留めると一覧の並びが変わるので、
 * 一覧を撮る側より後ろに居る。 */

test("留めると一覧の先頭に来て、外すと戻る", async ({ ui: page, instance }) => {
  await page.goto(instance.endpoint);
  // 行を選ぶ前に、一覧が届き切るのを待つ。
  await listSettled(page);
  // セッションの行だけ (mesh の行にも `.row` を使っている)。
  const rows = page.locator(".row:has(.row-pin)");
  await expect(rows.first()).toBeVisible();
  await settledOrder(page);

  // 留める相手は**名指し**で選ぶ。「いちばん下の行」は一覧の並びが指すもので、
  // 並びは同じ走行で先に走った spec が何をしたかで動く — 位置で選ぶと、留めた
  // 行が走行ごとに変わり、絵がその spec 順を焼き込む。
  const name = "長い transcript";
  const chosen = rows.filter({ has: page.locator(".name", { hasText: name }) });
  await expect(chosen).toHaveCount(1);
  await chosen.getByRole("button", { name: "☆" }).click();
  await expect(rows.first().locator(".name")).toHaveText(name);
  await expect(rows.first().getByRole("button", { name: "★" })).toBeVisible();
  await shot(page, "session-pinned.png");

  // 外すと先頭から降りる (元の並びは instance が言う順に戻る)。
  await rows.first().getByRole("button", { name: "★" }).click();
  await expect(rows.first().locator(".name")).not.toHaveText(name);
});

test("終了は確認を開くまで — 決めるのはダイアログの中", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}`);
  await listSettled(page);
  await settledOrder(page);
  const row = page.locator(".row:has(.row-pin)").filter({ hasText: "束 0 を片付ける" }).first();
  await row.getByRole("button", { name: "終了" }).click();

  // 危ないアクションの責務は確認を開くまで (DR-0003 §2.8)。開いた確認は区画
  // ひとつで、既定のボタンは取り消す方。
  const confirm = page.locator("dialog.confirm");
  await expect(confirm).toBeVisible();
  await expect(confirm.getByRole("button", { name: "やめる" })).toBeFocused();
  await shot(page, "session-kill-confirm.png");

  // 閉じるのはブラウザの持ち物 (`Escape`)。閉じれば何も起きていない。
  await page.keyboard.press("Escape");
  await expect(confirm).toHaveCount(0);
  await expect(row.getByRole("button", { name: "終了" })).toBeVisible();
});

/** 改名は `terminal` の能力を持つ instance にだけ出る (instance が端末に打鍵を
 * 送る形なので、端末が無ければ送り先が無い)。この使い捨ての host は端末を前に
 * 置いていないので、ここでは撮らない。 */
