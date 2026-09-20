import { SID, TALK_SID } from "./fixture.ts";
import { connected, expect, test } from "./harness.ts";

/** 話しかける所の手触り。絵ではなく、打った文字がどうなるかを見る。 */

// 宛先は絵を撮らないセッション (`TALK_SID`)。受け付けられた 1 通は transcript に
// 載るので、撮る側と同じセッションへ送ると基準がその行込みで焼かれ、spec の走る
// 順が絵を決めてしまう。
test("受け付けられたら入力欄は空になり、結果が 1 行出る", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${TALK_SID}/timeline`);
  await connected(page);
  // 送る入口は口の窓 1 つ (DR-0003 §2.7)。transcript の下に据え置きの入力欄は
  // 無いので、打つ前に口を開ける。
  await page.locator("button.fab").click();
  const box = page.locator(".fab-window .composer textarea");
  await expect(box).toBeVisible();

  // Enter はその場に改行を入れる (送らない)。
  await box.fill("下書き");
  await box.press("Enter");
  await expect(box).toHaveValue("下書き\n");

  // 送るのは ⌘/Ctrl+Enter と送信ボタン。この宛先は動いていないので 1 通は
  // inbox に積まれる — 積まれたのは契約では成功なので下書きは手放すが、窓は
  // 開いたまま、なぜ今は渡らなかったのかを 1 行で出す。
  await box.fill("⌘Enter で送る");
  await box.press("ControlOrMeta+Enter");
  await expect(page.locator(".fab-window .composer-outcome")).toContainText("inbox");
  await expect(box).toHaveValue("");

  await box.fill("ボタンで送る");
  await page.locator(".fab-window .composer button", { hasText: "送信" }).click();
  await expect(box).toHaveValue("");
  await expect(page.locator(".fab-window .composer-outcome")).toContainText("inbox");
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
  await page.locator(".timeline-head h2").click();
  await page.keyboard.press("/");
  await expect(page.getByRole("textbox", { name: /探す言葉/ })).toBeVisible();

  // 一覧を宛先にすれば、同じ `/` が並んでいるものを絞る窓を開く (§2.2)。
  await page.locator(".pane-list").click({ position: { x: 4, y: 4 } });
  await page.keyboard.press("/");
  await expect(page.getByRole("searchbox", { name: "今並んでいるものを絞る" })).toBeVisible();
});
