import { appendFileSync } from "node:fs";
import { SID } from "./fixture.ts";
import { expect, test } from "./harness.ts";

/** 追いかけている transcript に何か書かれた時、画面がそれを受け取るか。
 *
 * 絵ではなく振る舞いなので基準画像は撮らない。ここが実機で要る理由は、道が
 * 分類を挟んで長いこと — file に 1 行足されると instance がそれを読んで item に
 * し、`transcript_items:<sid>` の frame として送り、画面がそれを id で数えて
 * 末尾に足す。どこか 1 つでも噛み合わなければ、画面は静かに古いままになる。
 *
 * 名前が `screens` の後ろに来るのは順番のため: 最初の画面 (sign-in) は passkey を
 * **登録していない**ブラウザが見るものなので、登録を済ませた worker の後ろに
 * 置かない。この 2 つ (と backfill) は fixture の transcript に**書き足す**ので、
 * 絵を撮る側より必ず後ろに居る必要がある。 */

const AT = "2026-03-01T04:08:00.000Z";

test("file に書かれた 1 行が、分類されて末尾に現れる", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  const heading = page.getByRole("heading", { name: /transcript — / });
  await expect(heading).toHaveText(/[1-9]\d* item/);
  // 今いくつ持っているか。前に走った test が同じ file に書き足しているので、
  // 数そのものではなく**1 つ増えること**を見る。
  const before = Number(/(\d+) item/.exec((await heading.textContent()) ?? "")?.[1]);
  const said = "追記はそのまま末尾に現れます。";
  appendFileSync(
    `${instance.home}/projects/-visual-repo/${SID}.jsonl`,
    `${JSON.stringify({
      uuid: "rec-live-01",
      type: "assistant",
      timestamp: AT,
      message: { role: "assistant", content: [{ type: "text", text: said }] },
    })}\n`,
  );
  // instance が追記に気づく道は 2 つ (file の watch と、その取りこぼしを拾う
  // 低頻度の確認 poll) で、遅い方は 5 秒間隔。待つのは「出たか」で、間隔を勘で
  // 決めないための余裕を取る。
  await expect(page.getByText(said)).toBeVisible({ timeout: 20_000 });
  // 数え方も追いつく: 同じ item を購読と読み込みで二重に数えない。
  await expect(heading).toHaveText(new RegExp(`${String(before + 1)} item`));
});
