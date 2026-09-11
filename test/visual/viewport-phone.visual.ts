import { OTHER_SID } from "./fixture.ts";
import { expect, nothingOverflows, shot, test } from "./harness.ts";

/** 手のひらの幅で読んだ transcript。
 *
 * 絵と一緒に「窓より広いものが無いこと」を測る: 崩れは 1 枚の絵では「そういう
 * 見た目」と区別が付かないが、窓をはみ出した要素の名前は誰が広げたかを言う。
 *
 * 遡りを含めるのは、幅を決めるもの (表・コード・長い 1 行) が手前の頁に居るから
 * — 開いた直後の末尾だけを見ても崩れは出ない。読むのは誰も書き足さない方の
 * transcript (`fixture.ts` の phoneTranscript)。 */

test("狭い画面で遡っても、本文は窓の幅に収まる", async ({ phone: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${OTHER_SID}/timeline`);
  const heading = page.getByRole("heading", { name: /transcript — / });
  await expect(heading).toHaveText(/200 item/);
  await nothingOverflows(page);

  // 先頭まで。窓は描く範囲を持っているので、頁が足されたら改めて上へ行く。
  await expect(async () => {
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await expect(page.locator(".tl-edge").first()).toHaveText("— 先頭 —", { timeout: 2000 });
    await expect(page.getByText("畳んだ値の読み方")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await nothingOverflows(page);
  await shot(page, "phone-timeline.png");
});
