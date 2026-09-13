import { STATUS_SID } from "./fixture.ts";
import { expect, nothingOverflows, shot, test } from "./harness.ts";

/** 一覧と本文の並べ方。
 *
 * 広い画面では左右に並び、境目は掴んで動かせる。狭い画面では並べず、URL が
 * 名指す方だけを出して、切り替えは横へ滑らせる。
 *
 * 名前が `screens` の後ろに来るのは順番のため (一覧の開閉と幅はこのブラウザの
 * 覚えなので、撮り終えた後で動かす)。 */

test("広い画面では左右に並び、本文が残り幅を全部使う", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${STATUS_SID}/status`);
  await expect(page.locator(".pane-list")).toBeVisible();
  const room = await page.evaluate(() => document.documentElement.clientWidth);
  const list = (await page.locator(".pane-list").boundingBox())?.width ?? 0;
  const main = (await page.locator(".pane-main").boundingBox())?.width ?? 0;
  // 本文は残り全部 (境目と余白のぶんを除いて、窓の幅に届く)。
  expect(list + main).toBeGreaterThan(room - 60);
  await shot(page, "layout-split.png");
});

test("一覧は畳める。畳んだことはこのブラウザが覚える", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${STATUS_SID}/status`);
  await page.getByRole("button", { name: "一覧", exact: true }).click();
  await expect(page.locator(".pane-list")).toBeHidden();
  await shot(page, "layout-list-off.png");

  // 読み込み直しても畳んだまま (覚えは localStorage)。
  await page.reload();
  await expect(page.locator(".pane-list")).toBeHidden();
  await page.getByRole("button", { name: "一覧", exact: true }).click();
  await expect(page.locator(".pane-list")).toBeVisible();
});

test("境目を動かすと一覧の幅が変わり、その instance に覚えられる", async ({
  ui: page,
  instance,
}) => {
  await page.goto(`${instance.endpoint}s/${STATUS_SID}/status`);
  const width = async (): Promise<number> =>
    (await page.locator(".pane-list").boundingBox())?.width ?? 0;
  const before = await width();
  // 矢印キーでも動く (掴めるだけの境目にしない)。
  await page.locator(".panes-split").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const after = await width();
  expect(after).toBeGreaterThan(before);

  await page.reload();
  expect(await width()).toBe(after);

  // 動かした幅はこのブラウザに残る。この頁は後の test と同じ browser context を
  // 使うので、残したままだと**この後に撮る絵ぜんぶが「広げた一覧」で撮られる**
  // — 基準がその幅を焼き込み、その file だけを単体で走らせると既定の幅で描かれて
  // 一致しなくなる。覚えたことを確かめたら、覚えを消して既定に戻す。
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("ccmsg.layout.sessions-split:")) localStorage.removeItem(key);
    }
  });
  await page.reload();
  expect(await width()).toBe(before);
});

test("狭い画面では並べず、選ぶと本文へ滑る", async ({ phone: page, instance }) => {
  await page.goto(instance.endpoint);
  // 一覧だけが見えている: 1 枚が並びの幅ちょうどで、本文は横に並んだまま窓の外。
  const panes = await page.locator(".panes").boundingBox();
  const list = await page.locator(".pane-list").boundingBox();
  const main = await page.locator(".pane-main").boundingBox();
  expect(Math.round(list?.width ?? 0)).toBe(Math.round(panes?.width ?? -1));
  expect(Math.round(list?.x ?? -1)).toBe(Math.round(panes?.x ?? 0));
  expect(main?.x ?? 0).toBeGreaterThanOrEqual((panes?.x ?? 0) + (panes?.width ?? 0));
  await nothingOverflows(page);
  await shot(page, "phone-list.png");

  // セッションを選ぶと本文へ。一覧は左へ出ていく。
  await page.getByRole("button", { name: "束 0 を片付ける" }).click();
  await expect(page.getByRole("heading", { name: /transcript — / })).toBeVisible();
  // 滑り終わるまで待つ: 一覧は**まるまる 1 枚ぶん**左へ出る。途中で測ると、
  // 90ms の滑りのどこを掴んだかが答えになってしまう。
  const gone = Math.round((panes?.x ?? 0) - (panes?.width ?? 0));
  await expect
    .poll(async () => Math.round((await page.locator(".pane-list").boundingBox())?.x ?? 0))
    .toBeLessThanOrEqual(gone + 1);
  await nothingOverflows(page);
  // 撮るのは TL が自分で置いた所 (= 末尾)。頁の頭へ動かすと、仮想化した窓の
  // 上の空白しか写らない。
  // **本文の側は絵にしない**。TL は末尾を追って頁ごと置き直すので、滑り終わりと
  // 置き直しの重なり方で写る位置が変わる — 絵にすると撮った瞬間が基準になる。
  // ここで見たいのは「並べずに 1 枚だけを出し、横へ滑って入れ替わる」ことなので、
  // 位置と幅で見る (上の assert)。

  // バーの「一覧」で戻る (狭い画面ではこれが戻る道)。
  await page.getByRole("button", { name: "一覧", exact: true }).click();
  await expect
    .poll(async () => Math.round((await page.locator(".pane-list").boundingBox())?.x ?? -1))
    .toBe(Math.round(panes?.x ?? 0));
});
