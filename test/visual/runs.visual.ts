import { DUP_SID } from "./fixture.ts";
import { expect, shot, test } from "./harness.ts";

/** 同じセッションを 2 つのプロセスが書いている時に出る画面たち。
 *
 * instance はこの間、状態の畳みを止め、送る・書き出す・ファイルを読むを断る
 * (契約 DR-0001 §3)。なのでここに出るのは**どちらを終わらせるかを決める材料**
 * だけで、タブも下書きも出ない。pid と起動時刻は走るたびに変わるので、絵の
 * 中では覆う (`shot` の mask)。 */

test("二重に走っているセッションは、run を選ばせる", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${DUP_SID}/timeline`);
  await expect(
    page.getByRole("heading", { name: /を 2 つのプロセスが書いています$/ }),
  ).toBeVisible();
  // 選ぶ材料が run の数だけ並ぶ。
  await expect(page.locator(".runs .run")).toHaveCount(2);
  // 据え置きの送る所も、読む所も出さない (送るのは口の窓だけ)。
  await expect(page.locator(".composer")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "セッションの見方" })).toHaveCount(0);
  await shot(page, "runs-choice.png");
});

test("run を 1 つ選ぶと、その run だけの画面になる", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${DUP_SID}/timeline`);
  await page.getByRole("link", { name: "この run を見る" }).first().click();
  // 住所が run を名指している (`sid.pid`)。
  await expect(page).toHaveURL(/\/s\/[0-9a-f-]+\.\d+\/timeline$/);
  await expect(page.getByText("状態の畳みを止めています")).toBeVisible();
  await expect(page.getByRole("button", { name: "この run を終了" })).toBeVisible();
  await shot(page, "runs-restricted.png");
});

test("もう無い run を名指した URL は、終わったことを言って戻す", async ({ ui: page, instance }) => {
  // 999999 はこのセッションの run ではない。pid は OS が使い回すので、無いものを
  // 「たぶんこれ」と読み替えない。
  await page.goto(`${instance.endpoint}s/${DUP_SID}.999999/timeline`);
  await expect(page.getByRole("heading", { name: "この run は終了しました" })).toBeVisible();
  await shot(page, "runs-ended.png");
});
