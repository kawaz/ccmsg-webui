import { SID } from "./fixture.ts";
import { expect, test } from "./harness.ts";

/** 話しかける所の手触り。絵ではなく、打った文字がどうなるかを見る。 */

test("受け付けられたら入力欄は空になり、結果が 1 行出る", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  await expect(page.locator(".app-bar")).toContainText("接続済み");
  const box = page.locator(".composer textarea");

  // Enter はその場に改行を入れる (送らない)。
  await box.fill("下書き");
  await box.press("Enter");
  await expect(box).toHaveValue("下書き\n");

  // 送るのは ⌘/Ctrl+Enter と送信ボタン。受け付けられた時だけ空にする。
  await box.fill("⌘Enter で送る");
  await box.press("ControlOrMeta+Enter");
  await expect(box).toHaveValue("");
  await expect(page.locator(".composer-outcome")).toBeVisible();

  await box.fill("ボタンで送る");
  await page.locator(".composer button", { hasText: "送信" }).click();
  await expect(box).toHaveValue("");
});

test("⌘F は横取りされない (この画面の検索窓は開かない)", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  await expect(page.getByRole("button", { name: "この画面の中を探す" })).toBeVisible();
  await page.locator("body").press("ControlOrMeta+f");
  await page.locator("body").press("/");
  await expect(page.getByRole("textbox", { name: /探す言葉/ })).toHaveCount(0);
});
