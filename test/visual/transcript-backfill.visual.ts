import { appendFileSync } from "node:fs";
import { SID } from "./fixture.ts";
import { expect, test } from "./harness.ts";

/** 末尾から始めて、手前へ 1 頁ずつ歩けるか。
 *
 * 絵ではなく振る舞いなので基準画像は撮らない。実機で要るのは、これが webui だけ
 * では決まらないから — 上限だけを名指した読みが範囲の**新しい側**を答え、`prev`
 * が 1 つ手前を名指す、という instance 側の答え方に乗っている。1 頁 (200 item)
 * に収まる transcript では、どちら側から答えられていても同じ絵になるので、頁を
 * またぐ長さで確かめる。
 *
 * 名前が `screens` の後ろに来るのは順番のため (`transcript-tail.visual.ts` と
 * 同じ理由: 最初の画面は passkey を登録していないブラウザが見るもの)。 */

/** 頁 (200) をまたぐ長さ。3 頁目で fixture の分まで届く。 */
const BULK = 500;

/** 1 度遡ると増える分。instance が 1 頁で答える item の数。 */
const PAGE = 200;

test("末尾から始まり、遡ると手前が頁ずつ足される", async ({ ui: page, instance }) => {
  const path = `${instance.home}/projects/-visual-repo/${SID}.jsonl`;
  for (let n = 0; n < BULK; n += 1) {
    appendFileSync(
      path,
      `${JSON.stringify({
        uuid: `rec-bulk-${String(n).padStart(3, "0")}`,
        type: "assistant",
        timestamp: "2026-03-01T04:07:00.000Z",
        message: { role: "assistant", content: [{ type: "text", text: `bulk ${String(n)}` }] },
      })}\n`,
    );
  }
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  const heading = page.getByRole("heading", { name: /transcript — / });
  // 開いた所は末尾: 最後に書かれたものが見えている。始まりから読み下ろして
  // いたら、ここに居るのは `bulk 0` になる。
  await expect(page.getByText(`bulk ${String(BULK - 1)}`)).toBeVisible({ timeout: 20_000 });

  const held = async (): Promise<number> =>
    Number(/(\d+) item/.exec((await heading.textContent()) ?? "")?.[1]);
  const top = async () => {
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
  };

  // 開いた時点で持っているのは末尾の 1 頁**ぶん**。頁そのものの数は固定しない —
  // 購読が先に立っているので、読み込みの答えに加えて「その間に届いた分」が
  // 乗ることがあり、それは instance が追記を運んだという意味であって、頁の
  // 区切り方の話ではない。ここで固定するのは **1 度遡ると 1 頁ぶん増える** こと。
  const first = await held();
  expect(first).toBeGreaterThan(0);
  expect(first).toBeLessThan(BULK);

  await top();
  await expect(heading).toHaveText(new RegExp(`${String(first + PAGE)} item`));
  await top();
  // fixture の 11 item ごと、transcript ぜんぶ。`prev` が返らなくなった所が始まり。
  await expect(heading).toHaveText(/511 item/);
  await expect(page.locator(".tl-edge").first()).toHaveText("— 先頭 —");
});
