import { expect, ownBrowser, shot, test } from "./harness.ts";

/** 置き場に新しい build が出た時の印 (DR-0004 §2.4)。
 *
 * 置き場が答える名前だけを差し替える — 新しい build を本当に publish しなくても、
 * 頁から見えるものは同じ 1 つの文書なので、印が立つかどうかはそれで決まる。
 *
 * **自分の browser で撮る**。印は読み込み直すまで下りないので、共有の頁で立てる
 * と、後に撮る絵ぜんぶに橙のボタンが焼き込まれる。 */
test("置き場に新しい build があると、読み込み直す所の色が変わる", async ({ browser, instance }) => {
  const page = await ownBrowser(browser, instance);
  await expect(page.locator(".reload.outdated")).toHaveCount(0);
  await page.route("**/version.json", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ version: "99.0.0", built_at: "2026-09-20T00:00:00Z" }),
    });
  });
  // 前面に戻った時に聞き直す道をそのまま通す。頁は既に見えているので、伝える
  // のは出来事だけでよい。
  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
  });
  await expect(page.locator(".reload.outdated")).toHaveAttribute(
    "title",
    /新しい build があります/,
  );
  await shot(page, "build-update.png");
  await page.context().close();
});
