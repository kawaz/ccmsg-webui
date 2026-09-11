import { OTHER_SID } from "./fixture.ts";
import { expect, shot, test } from "./harness.ts";

/** 本文を日本語で読む。
 *
 * host の経路は daemon の実装をそのまま通る (使い捨ての helper が本物と同じ行を
 * 話す)。browser の経路はこのブラウザが翻訳機を持っている時にしか出ないので、
 * 基準に写るのは host の側だけ — 選択肢が道具ごとに並ぶこと自体は、host だけの
 * 環境でも見える。
 *
 * 名前が `screens` の後ろに来るのは順番のため (訳した本文は覚えられるので、
 * 原文で撮る画面より後ろに居る)。 */

/** 先頭まで遡る。英語の本文はそこに居る。
 *
 * 窓は描く範囲を持っているので、端に着いたことと、そこが描かれていることは
 * 別のこと — 頁が足されるたびに上へ行き直し、**本文が見えるまで**繰り返す。 */
async function toBeginning(
  page: import("@playwright/test").Page,
  shows: import("@playwright/test").Locator,
): Promise<void> {
  await expect(async () => {
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await expect(page.locator(".tl-edge").first()).toHaveText("— 先頭 —", { timeout: 2000 });
    await expect(shows).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
}

test("言語を選ぶと、段落ごとに訳が届いて本文が入れ替わる", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${OTHER_SID}/timeline`);
  // 訳す道具がある時だけ、言語の選択肢が出る。選ぶのは読み始める前。
  const tab = page.getByRole("button", { name: "日本語 (host)" });
  await expect(tab).toBeVisible();
  await tab.click();

  await toBeginning(page, page.getByText("【host の訳】The fold is read").first());
  // 段落の境は保たれる: 2 つ目の段落も別の段落として訳が届く。
  await expect(page.getByText("【host の訳】What is left to decide").first()).toBeVisible();
  // 同じ画面の日本語の段落は helper へ送られていない (送れば
  // 「【host の訳】畳んだ値の読み方」が出る)。
  await expect(page.getByText("【host の訳】畳んだ値の読み方")).toHaveCount(0);
  // 訳が出ている所まで下ろしてから撮る。先頭の数 item は日本語なので、上端の
  // ままでは「選択肢が出ている」ことしか写らない。
  await page.getByText("【host の訳】The fold is read").first().scrollIntoViewIfNeeded();
  await shot(page, "timeline-translated.png");

  // 原文へ戻すと、訳は消えて元の文が出る (上の行の選択肢。item の側にも同じ
  // 名前の入口があるので、押す所を名指しする)。
  await page
    .getByRole("group", { name: "本文の言語" })
    .getByRole("button", { name: "原文" })
    .click();
  await expect(page.getByText("【host の訳】The fold is read")).toHaveCount(0);
  await expect(page.getByText("The fold is read").first()).toBeVisible();
});

test("読んでいる所で切り替えても、読んでいる行は動かない", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${OTHER_SID}/timeline`);
  const english = page.getByText("The fold is read from the contract").first();
  await toBeginning(page, english);
  // 読んでいる文を画面の真ん中に置く。端に居る要素を押すとブラウザがそれを
  // 見える所へ入れるので、そこで測ると「押したから動いた」と「入口が遠いから
  // 動いた」が混ざる。
  await english.evaluate((node) => {
    node.scrollIntoView({ block: "center" });
  });
  await page.waitForTimeout(300);
  const at = async (): Promise<number> => Math.round((await english.boundingBox())?.y ?? -1);
  const before = await at();
  const scrolledBefore = await page.evaluate(() => window.scrollY);

  // item の側の入口を押す。**上端まで戻らずに押せる**ことがこの test の主題なので、
  // 押すのは Playwright の click — 画面内に無ければ動かしてしまうので、動かな
  // かったことがそのまま結果に出る。
  await english
    .locator("xpath=ancestor::div[contains(@class,'tl-line')][1]")
    .getByRole("button", { name: "訳" })
    .click();
  await expect(page.getByText("【host の訳】The fold is read").first()).toBeVisible();

  expect(await page.evaluate(() => window.scrollY)).toBe(scrolledBefore);
  // 訳で高さが変わっても、読んでいた行は同じ高さに居る (錨は Timeline が打つ)。
  expect(Math.abs((await at()) - before)).toBeLessThan(2);

  await page
    .getByRole("group", { name: "本文の言語" })
    .getByRole("button", { name: "原文" })
    .click();
});
