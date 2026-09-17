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

test("⌘F は横取りされない (結ばれた打鍵が 1 つも無いので)", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  await expect(page.getByRole("button", { name: "この画面の中を探す" })).toBeVisible();
  // 既定の割り当ては空 (DR-0003 §2.5)。⌘F はブラウザのものなので、この画面は
  // 受け取らない。
  await page.locator("body").press("ControlOrMeta+f");
  await expect(page.getByRole("textbox", { name: /探す言葉/ })).toHaveCount(0);
});

test("/ は宛先の区画の検索を開く", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  await expect(page.getByRole("button", { name: "この画面の中を探す" })).toBeVisible();

  // どの区画も宛先になっていない間は、区画の役としての打鍵も誰にも届かない。
  await page.locator("body").press("/");
  await expect(page.getByRole("textbox", { name: /探す言葉/ })).toHaveCount(0);

  // tl 本体を宛先にすると、同じ `/` がこの transcript の検索を開く。
  // 見出しを押して宛先を tl 本体にする (本文は追記で動き続けるので、押す所は
  // 動かない所を選ぶ)。
  await page.locator(".timeline > h2").click();
  await page.keyboard.press("/");
  await expect(page.getByRole("textbox", { name: /探す言葉/ })).toBeVisible();

  // 一覧を宛先にすれば、同じ `/` が並んでいるものを絞る窓を開く (§2.2)。
  await page.locator(".pane-list").click({ position: { x: 4, y: 4 } });
  await page.keyboard.press("/");
  await expect(page.getByRole("searchbox", { name: "今並んでいるものを絞る" })).toBeVisible();
});
