import { expect, shot, test } from "./harness.ts";

/** 行の上でできること (留める / 改名 / 終了) の試作。
 *
 * 名前が `screens` の後ろに来るのは順番のため — 留めると一覧の並びが変わるので、
 * 一覧を撮る側より後ろに居る。 */

test("留めると一覧の先頭に来て、外すと戻る", async ({ ui: page, instance }) => {
  await page.goto(instance.endpoint);
  // セッションの行だけ (mesh の行にも `.row` を使っている)。
  const rows = page.locator(".row:has(.row-pin)");
  await expect(rows.first()).toBeVisible();

  // 下の方に居る行を留める。
  const last = rows.last();
  const name = await last.locator(".name").innerText();
  await last.getByRole("button", { name: "☆" }).click();
  await expect(rows.first().locator(".name")).toHaveText(name);
  await expect(rows.first().getByRole("button", { name: "★" })).toBeVisible();
  await shot(page, "session-pinned.png");

  // 外すと先頭から降りる (元の並びは instance が言う順に戻る)。
  await rows.first().getByRole("button", { name: "★" }).click();
  await expect(rows.first().locator(".name")).not.toHaveText(name);
});

test("終了は 2 度押し — 1 度目で本当に終了かを聞く", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}`);
  const row = page.locator(".row:has(.row-pin)").filter({ hasText: "束 0 を片付ける" }).first();
  await row.getByRole("button", { name: "終了" }).click();
  await expect(row.getByRole("button", { name: "本当に終了" })).toBeVisible();
  // 押さずに離れれば何も起きない (この試作では行を出し直すだけ)。
  await page.reload();
  await expect(
    page
      .locator(".row")
      .filter({ hasText: "束 0 を片付ける" })
      .getByRole("button", { name: "終了" }),
  ).toBeVisible();
});

/** 改名は `terminal` の能力を持つ instance にだけ出る (instance が端末に打鍵を
 * 送る形なので、端末が無ければ送り先が無い)。この使い捨ての host は端末を前に
 * 置いていないので、ここでは撮らない。 */
