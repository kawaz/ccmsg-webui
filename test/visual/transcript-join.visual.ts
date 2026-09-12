import { JOIN_SAID, JOIN_SID } from "./fixture.ts";
import { expect, test } from "./harness.ts";

/** 頁をまたいで並んだ呼び出しと答えが、遡った後に 1 行として読めるか。
 *
 * 絵ではなく振る舞いなので基準画像は撮らない。実機で要るのは、これが webui だけ
 * では決まらないから — 答えが手前の頁に、呼び出しがその次の頁に落ちる時、2 つを
 * 結べるかは instance が答えに何を付けたか (`parent_item` と、harness が 2 つを
 * 組にした鍵 `parent_tool_use_id`) に乗っている。頁の中で完結する transcript では
 * どちらの手掛かりでも同じ絵になるので、境界をまたぐ長さで確かめる。
 *
 * transcript は fixture が先に書いてある (`JOIN_SID`)。境界の位置は行の数で
 * 決まるので、test が書き足して instance の取り込みを待つ形にすると、境界が
 * どこに落ちたかまで取り込みの速さに乗る。 */

test("頁をまたいで並んだ呼び出しと答えは、遡ると 1 行に結ばれる", async ({
  ui: page,
  instance,
}) => {
  await page.goto(`${instance.endpoint}s/${JOIN_SID}/timeline`);
  const heading = page.getByRole("heading", { name: /transcript — / });
  await expect(heading).toHaveText(/200 item/, { timeout: 20_000 });

  /** 1 頁遡る。頁の大きさは instance が決めるので、数そのものではなく「手元が
   * 増えた」ことで待つ。 */
  const top = async () => {
    const before = (await heading.textContent()) ?? "";
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await expect(heading).not.toHaveText(before);
  };
  // 2 頁目の先頭が答え、3 頁目の末尾が呼び出し。
  await top();
  await top();

  // 描かれるのは見えている所だけなので、行そのものは探して辿り着く (数えるのは
  // 手元に持っているかどうかで、今描かれているかではない)。
  await page.getByRole("button", { name: "この画面の中を探す" }).click();
  await page.getByRole("textbox", { name: /探す言葉/ }).fill(JOIN_SAID);
  await page.getByRole("button", { name: "次の一致へ" }).click();
  // 答えはもう自分の行を持たない: 呼び出しの行の**中**に入っている。だから
  // 答えの文を持つ行は 1 つで、その同じ行が呼び出しの中身も持っている。
  const joined = page.locator(".tl-line", { hasText: JOIN_SAID });
  await expect(joined).toHaveCount(1);
  await expect(joined).toContainText("echo 鍵");
});
