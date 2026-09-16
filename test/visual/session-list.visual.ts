import { expect, test } from "./harness.ts";

/** 一覧の見出しの並びと綴り。
 *
 * 絵を撮らない test — 見ているのは配置ではなく順序そのもので、順序は文字列の
 * 列として読める。絵にすると、並びが変わっていないことを人が目で確かめ直す
 * ことになる。 */

test("見出しは状態の名前のまま、起動中は最後", async ({ ui: page, instance }) => {
  await page.goto(instance.endpoint);
  // 起動中の行は daemon が端末管理に訊いて初めて届くので、その見出しが出るまで
  // 待ってから並びを読む (先頭の見出しはそれより早く出る)。
  await expect(page.getByRole("heading", { name: /^起動中 / })).toBeVisible();
  // 読むのは書いてある文字 (`textContent`) で、描かれた文字ではない — 見出しは
  // CSS が大文字に起こすので、綴りを見るなら起こす前を読む。
  const headings = await page.locator(".section h2").allTextContents();
  const names = headings.map((one) => one.replace(/\s*\(\d+\)$/, ""));

  // 状態の見出しは契約と同じ綴りで出る (訳さない)。
  expect(names).toContain("Duplicated");
  expect(names).toContain("Live");
  expect(names.some((one) => /^(稼働中|答え待ち|二重に走っている|終了|消失)$/.test(one))).toBe(
    false,
  );

  // まだ名乗っていないハーネスは、セッションの見出しより後ろ。
  const starting = names.indexOf("起動中");
  expect(starting).toBeGreaterThan(-1);
  expect(starting).toBeGreaterThan(names.indexOf("Live"));
  expect(starting).toBeGreaterThan(names.indexOf("Duplicated"));
});
