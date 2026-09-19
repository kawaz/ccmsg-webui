import { SID, TALK_SID } from "./fixture.ts";
import { expect, openMenu, ownBrowser, shot, test } from "./harness.ts";

/** 操作がアクションになった所の見た目 (DR-0003)。
 *
 * 撮るのは 3 つ — 宛先の区画に付く細い縁とカーソル、選んでいる 1 通、そして
 * キーバインドの設定。どれも「今どこに当たるか」を目に見せるためのもので、
 * 見えていなければキーは当たるも八卦になる。 */

test("宛先の区画に細い縁が付き、一覧にカーソルが立つ", async ({ ui: page, instance }) => {
  await page.goto(instance.endpoint);
  await expect(page.getByRole("heading", { name: /^起動中 / })).toBeVisible();

  // クリックした先が宛先になる。そこから上下でカーソルが動く。
  await page.locator(".pane-list").click({ position: { x: 4, y: 4 } });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".pane-list.standing")).toBeVisible();
  await expect(page.locator(".row.on-cursor")).toHaveCount(1);
  await shot(page, "actions-standing-list.png");
});

test("← でセクションが畳まれ、畳んだ分は 1 単位になる", async ({ ui: page, instance }) => {
  await page.goto(instance.endpoint);
  await expect(page.getByRole("heading", { name: /^起動中 / })).toBeVisible();
  await page.locator(".pane-list").click({ position: { x: 4, y: 4 } });

  // 先頭の見出しへ降り、行まで入ってから ← を 2 回。1 回目は見出しへ戻り
  // (「1 つ外へ」)、2 回目でそのセクションを畳む。
  await page.keyboard.press("ArrowDown");
  const head = page.locator(".section-fold").first();
  await expect(head).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".row.on-cursor")).toHaveCount(1);
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".row.on-cursor")).toHaveCount(0);
  await expect(head).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowLeft");
  await expect(head).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".row.on-cursor")).toHaveCount(0);
  await shot(page, "actions-collapsed-section.png");

  // → で開き直ると、また中の行が並ぶ。
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowRight");
  await expect(head).toHaveAttribute("aria-expanded", "true");
});

test("選んだ 1 通に ▲ ▼ が出て、同じ声だけを辿る", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  await expect(page.locator(".tl-bubble").first()).toBeVisible();

  // 同じ声が 2 つ以上ある列を選ぶ。この fixture では人の発言は 1 通しかない
  // ので、そこから「同じ声の次へ」が効かないのは正しい振る舞い。
  await page.locator(".tl-bubble .tl-who", { hasText: "セッション" }).first().click();
  const chosen = page.locator(".tl-bubble.chosen");
  await expect(chosen).toHaveCount(1);
  await expect(chosen.getByRole("button", { name: "同じ声の次へ" })).toBeVisible();
  await shot(page, "actions-chosen-message.png");

  // 同じ声の次へ。選んだ 1 通が決めた列を辿るので、押した先も同じ相手の声。
  const who = await chosen.locator(".tl-who").first().textContent();
  await chosen.getByRole("button", { name: "同じ声の次へ" }).click();
  await expect(page.locator(".tl-bubble.chosen")).toHaveCount(1);
  expect(await page.locator(".tl-bubble.chosen .tl-who").first().textContent()).toBe(who);
});

test("キーバインドの設定は、綴りと今の環境での姿を並べて出す", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}settings`);
  await expect(page.getByRole("heading", { name: "キーバインド" })).toBeVisible();

  // 既定は空。結ぶまで、この画面はどの打鍵も奪わない。
  const row = page.getByLabel("次へ (transcript) の打鍵");
  await expect(row).toHaveValue("");

  // 通る組み合わせ: 綴りの隣に、今の platform に解決した姿が出る。
  await row.fill("CmdOrCtrl+Shift+KeyK");
  await expect(page.locator(".key-shown").first()).toBeVisible();

  // 奪ってしまう組み合わせは、何が失われるかを先に言う (断りはしない)。
  await page.getByLabel("前へ (transcript) の打鍵").fill("CmdOrCtrl+KeyF");
  await expect(page.locator(".key-warned").first()).toContainText("ページ内検索");

  // ブラウザがページに渡さない打鍵は、設定できても効かないことを言う。
  // タブを閉じる手は Chromium がどの platform でも予約するので (DR-0003 §2.5 の
  // 出典)、走らせる platform を問わずここに出る。
  await page.getByLabel("同じ声の次へ の打鍵").fill("CmdOrCtrl+KeyW");
  await expect(page.locator(".key-reserved").first()).toContainText("効きません");
  await shot(page, "actions-key-bindings.png");
});

/** どこからでも話しかける口 (DR-0003 §2.7)。
 *
 * 宛先は URL が名指すセッションなので、transcript を開いていない見方 (ここでは
 * ファイル) からでも同じ 1 つが起きる。セッションを名指していない画面には出ない
 * — 届く先が無い所に押す所を置かない。 */
test("FAB はセッションを名指す画面にだけ出て、口に付く窓を開く", async ({ ui: page, instance }) => {
  await page.goto(instance.endpoint);
  await expect(page.getByRole("heading", { name: /^起動中 / })).toBeVisible();
  // 一覧だけを見ている間は宛先が無い。
  await expect(page.locator("button.fab")).toHaveCount(0);

  await page.goto(`${instance.endpoint}s/${SID}/files`);
  const fab = page.locator("button.fab");
  await expect(fab).toBeVisible();
  await shot(page, "actions-fab.png");
  await fab.click();

  // 開いた先は口に付く窓で、載っているのは 1 つしかない composer (送れるかの
  // 判定も下書きの置き場も 1 通り)。transcript の下に据え置きの入力欄は無い。
  const prompt = page.locator(".fab-window");
  await expect(prompt).toBeVisible();
  await expect(prompt.getByRole("textbox", { name: "セッションへのメッセージ" })).toBeFocused();
  await shot(page, "actions-prompt.png");

  // 後ろは不活にならない — 読んでいた所をそのまま触っていられる。
  await expect(page.locator(".pane-list")).not.toHaveAttribute("inert", /.*/);

  // 閉じる手は 3 つ。まずは窓が持っている押す所。
  await prompt.getByRole("button", { name: "閉じる" }).click();
  await expect(prompt).toBeHidden();

  // 次に窓の外 (popover のライトディスミス)。口の上は「外」ではないので、別の
  // 所を押す。
  await fab.click();
  await expect(prompt).toBeVisible();
  await page.mouse.click(20, 20);
  await expect(prompt).toBeHidden();

  // 最後に Escape (同じくライトディスミス)。
  await fab.click();
  await expect(prompt).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(prompt).toBeHidden();

  // 送れたら閉じる。窓は用が済んだら消えるもので、続けて書くならもう一度
  // 開く (下書きは同じ所に残っている)。
  //
  // 送る先は**絵を撮るセッションと分ける** (`fixture.ts` の TALK_SID)。受け付け
  // られた 1 通は transcript に載るので、撮る側と同じ所へ送ると、この後に撮る
  // 画面ぜんぶが「その 1 通がもう届いているか」で変わる (item が 7 だったり 8
  // だったりする)。
  await page.goto(`${instance.endpoint}s/${TALK_SID}/files`);
  await expect(fab).toBeVisible();
  await fab.click();
  await expect(prompt).toBeVisible();
  await prompt.getByRole("textbox", { name: "セッションへのメッセージ" }).fill("FAB から 1 通");
  await prompt.getByRole("button", { name: "送信" }).click();
  await expect(prompt).toBeHidden({ timeout: 20_000 });
});

/** 口は掴んで動かせて、窓は口に付いて動く (DR-0003 §2.7)。
 *
 * 覚えるのは**近い側の辺とそこからの距離**なので、読み込み直しても同じ隅に
 * 出る — 素の座標で覚えると、窓の大きさが変わった時に置いた隅から離れる。 */
test("FAB は掴んで動かせて、窓ごと付いてくる", async ({ browser, instance }) => {
  // 自分の browser を要る: 口の居場所はこのブラウザが覚えるもので、読み込み
  // 直して確かめる手も要る。絵を撮るブラウザを共有したまま動かすと、口が写る
  // 画面ぜんぶが「どの test が先に走ったか」で変わる。
  const page = await ownBrowser(browser, instance);
  await page.goto(`${instance.endpoint}s/${SID}/files`);
  const fab = page.locator("button.fab");
  await expect(fab).toBeVisible();
  const before = await fab.boundingBox();
  expect(before).not.toBeNull();

  // 窓を開いたまま掴む。掴んでいる間に閉じては、窓ごと動かせない。
  await fab.click();
  const prompt = page.locator(".fab-window");
  await expect(prompt).toBeVisible();
  const windowBefore = await prompt.boundingBox();
  expect(windowBefore).not.toBeNull();

  await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2);
  await page.mouse.down();
  await page.mouse.move(before!.x - 160, before!.y - 90, { steps: 8 });
  await page.mouse.up();

  await expect(prompt).toBeVisible();
  const after = await fab.boundingBox();
  expect(after!.x).toBeLessThan(before!.x - 100);
  expect(after!.y).toBeLessThan(before!.y - 50);
  const windowAfter = await prompt.boundingBox();
  expect(windowAfter!.x).toBeLessThan(windowBefore!.x);
  await shot(page, "actions-fab-moved.png");

  // 掴んで離した指は押していない — 窓は開いたままで、閉じてもいない。
  await expect(prompt.getByRole("textbox", { name: "セッションへのメッセージ" })).toBeVisible();

  // 覚えたのは辺からの距離。読み込み直しても同じ所に出る。
  await page.reload();
  await expect(fab).toBeVisible();
  const again = await fab.boundingBox();
  expect(Math.abs(again!.x - after!.x)).toBeLessThan(2);
  expect(Math.abs(again!.y - after!.y)).toBeLessThan(2);

  // 右下に置いたものは、窓を狭くしても右下に居る (辺から測っているので、
  // 隅からの距離が変わらない)。置き直すのは窓の大きさが変わったと**聞いて
  // から**なので、測るのはその後 — 変わった瞬間に測ると、まだ前の所に居る。
  const wide = page.viewportSize()!;
  const rightBefore = wide.width - (again!.x + again!.width);
  const lowBefore = wide.height - (again!.y + again!.height);
  await page.setViewportSize({ width: wide.width - 200, height: wide.height - 120 });
  const narrow = page.viewportSize()!;
  await expect
    .poll(async () => {
      const at = (await fab.boundingBox())!;
      return Math.round(narrow.width - (at.x + at.width));
    })
    .toBe(Math.round(rightBefore));
  const low = (await fab.boundingBox())!;
  expect(Math.abs(narrow.height - (low.y + low.height) - lowBefore)).toBeLessThan(2);

  await page.context().close();
});

/** 書く所は上の縁で広げられる (下へは textarea 自身の摘みが効く)。 */
test("書く所は上の縁で広げられる", async ({ browser, instance }) => {
  const page = await ownBrowser(browser, instance);
  await page.goto(`${instance.endpoint}s/${SID}/files`);
  await page.locator("button.fab").click();
  const prompt = page.locator(".fab-window");
  const box = prompt.getByRole("textbox", { name: "セッションへのメッセージ" });
  await expect(box).toBeVisible();
  const before = await box.boundingBox();

  // 上の縁を引き上げる。窓は口の上に開いているので、伸びる先は上。
  const grip = prompt.locator(".fab-grip");
  const at = await grip.boundingBox();
  await page.mouse.move(at!.x + at!.width / 2, at!.y + at!.height / 2);
  await page.mouse.down();
  await page.mouse.move(at!.x + at!.width / 2, at!.y - 120, { steps: 8 });
  await page.mouse.up();

  const after = await box.boundingBox();
  expect(after!.height).toBeGreaterThan(before!.height + 90);

  // 高さも覚えてある。
  await page.reload();
  await page.locator("button.fab").click();
  await expect(box).toBeVisible();
  const again = await box.boundingBox();
  expect(Math.abs(again!.height - after!.height)).toBeLessThan(2);

  await page.context().close();
});

/** 誤って押されて困るものと、開きに行く時にしか要らないものはメニューの中
 * (DR-0004 §2.4)。 */
test("ハンバーガーに行き先と切断が畳まれている", async ({ ui: page, instance }) => {
  await page.goto(instance.endpoint);
  await expect(page.getByRole("heading", { name: /^起動中 / })).toBeVisible();
  // 道に出ているのは「今どうなっているか」と、何度も押すものだけ。
  await expect(page.getByRole("button", { name: "切断", exact: true })).toBeHidden();

  await openMenu(page);
  const menu = page.locator("#global-menu");
  await expect(menu.getByRole("button", { name: "一覧", exact: true })).toBeVisible();
  await expect(menu.getByRole("link", { name: /使用量/ })).toBeVisible();
  await expect(menu.getByRole("link", { name: "アカウント" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "設定" })).toBeVisible();
  await expect(menu.getByRole("button", { name: "切断", exact: true })).toBeVisible();
  await shot(page, "actions-menu.png");

  // 閉じる手は popover の持ち物。
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});

/** 戻る / 進むは**この画面が持つ** (DR-0004 §2.4)。ホーム画面に追加した PWA や
 * 全画面にはブラウザの戻る手が無いので、端末によって在ったり無かったりする道具を
 * 当てにしない。押せるかを答えるのは Navigation API で、**このタブの履歴そのもの**
 * を見ている (自分で数えた深さは、読み込み直した後に嘘になる)。 */
test("戻る / 進むは履歴のある方だけ押せる", async ({ ui: page, instance }) => {
  await page.goto(instance.endpoint);
  await expect(page.getByRole("heading", { name: /^起動中 / })).toBeVisible();
  const back = page.getByRole("button", { name: "戻る" });
  const forward = page.getByRole("button", { name: "進む" });
  // まだ一度も戻っていないので、先は無い (手前があるかは、この browser がここへ
  // 来るまでに通った道の話なので見ない)。
  await expect(forward).toBeDisabled();

  await page.getByRole("button", { name: /topic の畳み方/ }).click();
  await expect(page).toHaveURL(new RegExp(`/s/${SID}/timeline$`));
  await expect(back).toBeEnabled();
  await expect(forward).toBeDisabled();

  await back.click();
  await expect(page).toHaveURL(new RegExp(`${instance.endpoint}$`));
  await expect(forward).toBeEnabled();

  await forward.click();
  await expect(page).toHaveURL(new RegExp(`/s/${SID}/timeline$`));
  await expect(forward).toBeDisabled();
});
