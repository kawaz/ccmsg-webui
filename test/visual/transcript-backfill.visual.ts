import { BULK_ITEMS, BULK_SID } from "./fixture.ts";
import { expect, test } from "./harness.ts";

/** 末尾から始めて、手前へ 1 頁ずつ歩けるか。
 *
 * 絵ではなく振る舞いなので基準画像は撮らない。実機で要るのは、これが webui だけ
 * では決まらないから — 上限だけを名指した読みが範囲の**新しい側**を答え、`prev`
 * が 1 つ手前を名指す、という instance 側の答え方に乗っている。1 頁 (200 item)
 * に収まる transcript では、どちら側から答えられていても同じ絵になるので、頁を
 * またぐ長さで確かめる。
 *
 * 長さは fixture が先に書いてある (`BULK_SID`)。test が走ってから書き足す形だと、
 * 見ているのが「遡れるか」ではなく「書き足しの束をどれだけ速く取り込むか」に
 * なってしまう — 実際、遅い機械ではそちらが追いつかず、末尾に届く前の頁を見て
 * 落ちた。取り込みが追いつくことは `transcript-tail` の側が見る。 */

/** 1 度遡ると増える分。instance が 1 頁で答える item の数。 */
const PAGE = 200;

test("末尾から始まり、遡ると手前が頁ずつ足される", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${BULK_SID}/timeline`);
  const heading = page.getByRole("heading", { name: /transcript — / });
  // 開いた所は末尾: 最後に書かれたものが見えている。始まりから読み下ろして
  // いたら、ここに居るのは `bulk 0` になる。
  await expect(page.getByText(`bulk ${String(BULK_ITEMS - 1)}`)).toBeVisible({ timeout: 20_000 });

  const held = async (): Promise<number> =>
    Number(/(\d+) item/.exec((await heading.textContent()) ?? "")?.[1]);
  const top = async () => {
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
  };

  // 開いた時点で持っているのは末尾の 1 頁ぶん。
  const first = await held();
  expect(first).toBe(PAGE);

  await top();
  await expect(heading).toHaveText(new RegExp(`${String(first + PAGE)} item`));
  await top();
  // 最初の 1 行ごと、transcript ぜんぶ。`prev` が返らなくなった所が始まり。
  await expect(heading).toHaveText(new RegExp(`${String(BULK_ITEMS + 1)} item`));
  await expect(page.locator(".tl-edge").first()).toHaveText("— 先頭 —");
});
