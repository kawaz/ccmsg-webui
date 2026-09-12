import { appendFileSync } from "node:fs";
import { SID } from "./fixture.ts";
import { expect, test } from "./harness.ts";

/** 頁をまたいで並んだ呼び出しと答えが、遡った後に 1 行として読めるか。
 *
 * 絵ではなく振る舞いなので基準画像は撮らない。実機で要るのは、これが webui だけ
 * では決まらないから — 答えが手前の頁に、呼び出しがその次の頁に落ちる時、2 つを
 * 結べるかは instance が答えに何を付けたか (`parent_item` と、harness が 2 つを
 * 組にした鍵 `parent_tool_use_id`) に乗っている。頁の中で完結する transcript では
 * どちらの手掛かりでも同じ絵になるので、境界をまたぐ長さで確かめる。
 *
 * 名前が `screens` の後ろに来るのは順番のため (`transcript-tail.visual.ts` と
 * 同じ理由)。 */

const AT = "2026-03-01T04:09:00.000Z";
const KEY = "toolu_join_01";
const SAID = "頁をまたいで結んだ結果です。";

/** 頁は 200 item。答えを**遡り読み**の頁の先頭にちょうど置くと、呼び出しは
 * 1 つ手前 = 次の頁の末尾に落ちる。最初の 200 item は購読の snapshot が運ぶので、
 * 境界に使えるのは 2 頁目から (= 答えの後ろに 2 頁分)。 */
const AFTER_RESULT = 399;

function line(row: Record<string, unknown>): string {
  return `${JSON.stringify({ timestamp: AT, ...row })}\n`;
}

test("頁をまたいで並んだ呼び出しと答えは、遡ると 1 行に結ばれる", async ({
  ui: page,
  instance,
}) => {
  const path = `${instance.home}/projects/-visual-repo/${SID}.jsonl`;
  appendFileSync(
    path,
    line({
      uuid: "rec-join-call",
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "tool_use", id: KEY, name: "Bash", input: { command: "echo 鍵" } }],
      },
    }) +
      line({
        uuid: "rec-join-result",
        type: "user",
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: KEY }] },
        toolUseResult: { stdout: SAID },
      }),
  );
  for (let n = 0; n < AFTER_RESULT; n += 1) {
    appendFileSync(
      path,
      line({
        uuid: `rec-join-after-${String(n).padStart(3, "0")}`,
        type: "assistant",
        message: { role: "assistant", content: [{ type: "text", text: `after ${String(n)}` }] },
      }),
    );
  }

  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  const heading = page.getByRole("heading", { name: /transcript — / });
  // 開いた所は末尾。何 item 持っているかは固定しない — 同じ transcript に
  // 書き足す test が前に走るし、購読が立っている間に届いた分も乗る。この test
  // が見るのは**遡ると呼びと答えが 1 行に結ばれる**ことで、頁の大きさは
  // `transcript-backfill` の主題。
  await expect(heading).toHaveText(/\d+ item/, { timeout: 20_000 });

  /** 1 頁遡る。頁の大きさは instance が決めるので、数そのものではなく「手元が
   * 増えた」ことで待つ (この file の前に走った test も同じ transcript に書き足す)。 */
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
  await page.getByRole("textbox", { name: /探す言葉/ }).fill(SAID);
  await page.getByRole("button", { name: "次の一致へ" }).click();
  // 答えはもう自分の行を持たない: 呼び出しの行の中に入っている。
  await expect(page.locator('[data-search-key="rec-join-call:0"]')).toContainText(SAID);
  await expect(page.locator('[data-search-key="rec-join-result:0"]')).toHaveCount(0);
});
