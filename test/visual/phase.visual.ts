import type { Page } from "@playwright/test";
import { SID } from "./fixture.ts";
import {
  connected,
  expect,
  forgetPasskeys,
  listSettled,
  openMenu,
  ownBrowser,
  shot,
  test,
} from "./harness.ts";

/** 許可が変わった時に画面がどうなるか (DR-0004)。
 *
 * ここの 3 つは**どれも自分の browser を要る**: family を失効させることも降りる
 * ことも、その browser が二度と繋がらない状態を作るので、共有の頁でやると後に
 * 走る画面まで巻き込む (`ownBrowser`)。
 *
 * 失効は instance に本当に頼む — family の失効はその family の接続を閉じる
 * (契約 DR-0030 §5)。だから socket を落とす小細工は要らず、起きるのは本物の順番
 * そのもの: 接続が閉じ、繋ぎ直しの handshake が断られ、画面が `stale` のまま
 * passkey を頼む。 */

/** この browser の refresh cookie が名指す family を失効させる。
 *
 * 頁の中から呼ぶのは cookie を運ぶため (`credentials: "include"`) — token の値は
 * 述べない。述べられる呼び手は読める呼び手なので、契約がそもそも取らない。 */
async function endFamily(page: Page, endpoint: string): Promise<void> {
  const status = await page.evaluate(async (at: string) => {
    const answer = await fetch(`${at}auth/signout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: "{}",
    });
    return answer.status;
  }, endpoint);
  expect(status).toBe(200);
}

/** 許可が切れても読んでいたものは消えず、passkey だけを頼まれる (§2.4)。 */
test("許可が切れたら、画面を残したまま passkey を頼む", async ({ browser, instance }) => {
  const page = await ownBrowser(browser, instance);
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  await connected(page);
  await expect(page.getByText("畳んだ値の読み方")).toBeVisible();
  // 一覧が届き切ってから切る。届く途中で切ると、絵に写るのが「古い一覧」では
  // なく「まだ来ていない一覧」になり、それは確かめたいことではない。
  await listSettled(page);

  await endFamily(page, instance.endpoint);

  // 姿は `stale` のまま。重なるのは passkey の 1 枚だけ。
  const dialog = page.locator("dialog.reauth");
  await expect(dialog).toBeVisible();
  // 後ろの workspace は最初から動いていない — 読んでいた transcript も、URL も。
  await expect(page.getByText("畳んだ値の読み方")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/s/${SID}/timeline$`));
  await shot(page, "reauth.png");

  // **断られても画面は捨てない** (§2.3 の「重ねた再認証が断られた」)。認証器から
  // passkey を取り上げると、人が求めを取り消した時と同じ答えが返る。
  await forgetPasskeys(page);
  await dialog.getByRole("button", { name: "passkey で認証", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(page.getByText("畳んだ値の読み方")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/s/${SID}/timeline$`));
  // 認証の画面へは行っていない (そこには繋ぐ所しかない)。
  await expect(page.getByRole("button", { name: "接続", exact: true })).toBeHidden();

  // **閉じられる**。閉じた後は `stale` の画面が読め、後ろの道にも届く (§2.5)。
  await dialog.getByRole("button", { name: "閉じる" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("畳んだ値の読み方")).toBeVisible();
  await expect(page.getByRole("button", { name: "メニュー" })).toBeEnabled();
  await shot(page, "reauth-closed.png");

  // 閉じても許可が切れている事実は下りないので、状態の印から出し直せる。
  await page.locator("nav button.status-mark").click();
  await expect(dialog).toBeVisible();
  await page.context().close();
});

/** 降りると、向こうの family も手元の覚えも残らない (§2.6)。絵は撮らない —
 * 見たいのは**消えた後に何が残っていないか**で、それは画面の形には出ない。
 *
 * 画面に出る切り方は 1 つ (「切断」) で、意味は降りること。ハンバーガーの中に
 * 居るので、押すには先にメニューを開く。 */
test("切断は family を失効させ、この端末の覚えも残さない", async ({ browser, instance }) => {
  const page = await ownBrowser(browser, instance);
  await page.goto(instance.endpoint);
  await connected(page);
  // 降りる前は、この origin の覚えが在る (少なくとも繋ぎ先そのもの)。
  const before = await page.evaluate(() =>
    Object.keys(localStorage).filter((one) => one.startsWith("ccmsg.")),
  );
  expect(before).toContain("ccmsg.endpoint");
  // この頁が読み込み直されたことを後で言えるようにしておく。メモリに残っている
  // 写し (留めたセッション・絞り込み・選んでいた 1 通) が次の人に残らないのは、
  // 消して回るからではなく**頁が立ち上がり直すから** (§2.6)。
  await page.evaluate(() => {
    document.title = "降りる前の頁";
  });

  // 押す所から起こす。取り返しが付かない側なので、一度確かめてから。
  await openMenu(page);
  await page.getByRole("button", { name: "切断", exact: true }).click();
  await page.locator("dialog.confirm").getByRole("button", { name: "切断する" }).click();

  // トップに戻り、繋ぐ所だけが出ている。
  await expect(page.getByRole("button", { name: "接続", exact: true })).toBeVisible();
  // 同じ頁のままではない: 降りるは読み込み直しで終わる。
  expect(await page.title()).not.toBe("降りる前の頁");
  await expect(page).toHaveURL(new RegExp(`^${instance.endpoint}$`));
  await expect(page.locator(".row")).toHaveCount(0);
  // `ccmsg.` の付くこの origin の名前は 1 つも残らない (設定は既定 off)。
  expect(
    await page.evaluate(() => Object.keys(localStorage).filter((one) => one.startsWith("ccmsg."))),
  ).toEqual([]);

  // cookie も失効している: 読み込み直しても勝手には繋がらない (`resume` が
  // 提示するものを持たない)。
  await page.reload();
  await expect(page.getByRole("button", { name: "接続", exact: true })).toBeVisible();
  await expect(page.locator(".status-mark.open")).toBeHidden();
  await page.context().close();
});

/** 未認証で接続後の URL に来た時 (§2.7)。URL はその人が受け取ったもので、この
 * 画面が勝手に書き換えてよいものではない。捨ててよいのは、憶えた住所が無い —
 * まだ誰のものでもない — 端末だけ。 */
test("憶えた住所が無い端末だけが、接続後の URL を手放す", async ({ page, instance }) => {
  // 登録していない browser = 覚えも cookie も持たない端末。
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  await expect(page).toHaveURL(new RegExp(`^${instance.endpoint}$`));
  await expect(page.getByRole("button", { name: "接続" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("ccmsg.endpoint"))).toBeNull();
});

test("憶えた住所がある端末は、接続後の URL のまま繋ぎに行く", async ({ browser, instance }) => {
  const page = await ownBrowser(browser, instance);
  // 登録で繋ぎ先を覚えている端末。接続後にしか立たない画面を直に開く。
  await page.goto(`${instance.endpoint}settings`);
  await connected(page);
  await expect(page).toHaveURL(new RegExp("/settings$"));
  await expect(page.getByRole("heading", { name: "色", exact: true })).toBeVisible();
  await page.context().close();
});
