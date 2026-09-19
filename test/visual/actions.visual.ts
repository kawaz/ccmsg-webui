import { SID } from "./fixture.ts";
import { expect, openMenu, shot, test } from "./harness.ts";

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
test("FAB はセッションを名指す画面にだけ出て、composer を重ねる", async ({
  ui: page,
  instance,
}) => {
  await page.goto(instance.endpoint);
  await expect(page.getByRole("heading", { name: /^起動中 / })).toBeVisible();
  // 一覧だけを見ている間は宛先が無い。
  await expect(page.locator("button.fab")).toHaveCount(0);

  await page.goto(`${instance.endpoint}s/${SID}/files`);
  const fab = page.locator("button.fab");
  await expect(fab).toBeVisible();
  await fab.click();

  // 開いた先は確認と同じ重なりの節で、載っているのは transcript の下と同じ
  // composer (送れるかの判定も下書きの置き場も 1 通り)。
  const prompt = page.locator("dialog.confirm.prompt");
  await expect(prompt).toBeVisible();
  await expect(prompt.getByRole("textbox", { name: "セッションへのメッセージ" })).toBeFocused();
  await shot(page, "actions-prompt.png");

  // 閉じる手は重なりの持ち物 (Escape)。
  await page.keyboard.press("Escape");
  await expect(prompt).toBeHidden();

  // 送れたら閉じる。重なりは用が済んだら消えるもので、続けて書くならもう一度
  // 開く (下書きは同じ所に残っている)。
  await fab.click();
  await expect(prompt).toBeVisible();
  await prompt.getByRole("textbox", { name: "セッションへのメッセージ" }).fill("FAB から 1 通");
  await prompt.getByRole("button", { name: "送信" }).click();
  await expect(prompt).toBeHidden({ timeout: 20_000 });
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
 * 当てにしない。押せるかは自分で数えた履歴の深さが言う。 */
test("戻る / 進むは履歴の深さの分だけ押せる", async ({ ui: page, instance }) => {
  await page.goto(instance.endpoint);
  await expect(page.getByRole("heading", { name: /^起動中 / })).toBeVisible();
  const back = page.getByRole("button", { name: "戻る" });
  const forward = page.getByRole("button", { name: "進む" });
  // 開いたばかりの頁は、手前も先も無い。
  await expect(back).toBeDisabled();
  await expect(forward).toBeDisabled();

  await page.getByRole("button", { name: /topic の畳み方/ }).click();
  await expect(page).toHaveURL(new RegExp(`/s/${SID}/timeline$`));
  await expect(back).toBeEnabled();
  await expect(forward).toBeDisabled();

  await back.click();
  await expect(page).toHaveURL(new RegExp(`${instance.endpoint}$`));
  await expect(back).toBeDisabled();
  await expect(forward).toBeEnabled();

  await forward.click();
  await expect(page).toHaveURL(new RegExp(`/s/${SID}/timeline$`));
  await expect(forward).toBeDisabled();
});
