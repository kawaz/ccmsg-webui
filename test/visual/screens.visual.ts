import { AGENT_ID, OTHER_SID, SID } from "./fixture.ts";
import { emptyAuthenticator, expect, shot, test } from "./harness.ts";

/** What the screens look like, screen by screen.
 *
 * Each test draws one screen and nothing else depends on it: the registration
 * every screen after the first two rests on is done in the fixture (see
 * `harness.ts`), so a screen that fails to match fails alone. Playwright is
 * told not to parallelise — one daemon, one dev server, fixed ports. */

// 初めて開いた画面。出来ることは「接続」だけで、認証の話はまだ出さない —
// 押してみるまで、この端末に何があるかは分からない。
test("first-connect", async ({ page, instance }) => {
  // The built-in `page`, not `ui`: what these two screens are is a browser that
  // has not registered, and a context of its own is exactly that.
  await page.goto(instance.endpoint);
  // 押す所は接続バーの 1 つだけ。本文には何も置かない — 繋がっていないことも、
  // 繋ぐ手も、バーが既に持っている。
  await expect(page.getByRole("button", { name: "接続" })).toHaveCount(1);
  // バーに在るのは行き先の綴りと、そこへ繋ぐ 1 つだけ。まだ何も始めていない
  // ことはドットが言うので語は要らず、出し入れする一覧もまだ無い。
  await expect(page.getByRole("button", { name: "一覧" })).toHaveCount(0);
  await expect(page.locator(".app-bar")).not.toContainText("未接続");
  await expect(page.getByRole("heading", { name: "passkey で認証する" })).toBeHidden();
  // 一覧そのものが無いこと。行が 0 件の一覧は「セッションが 1 つも無い」と
  // 読めてしまい、繋がっていないことを言わない。
  await expect(page.locator(".row")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: /並び/ })).toHaveCount(0);
  await shot(page, "first-connect.png");
});

test("sign-in", async ({ page, instance }) => {
  // 何も登録していない端末に authenticator だけ持たせる: 「接続」を押すと
  // passkey を訊かれ、答えられるものが無いことがその場で分かる。そこで初めて
  // 登録の案内が出る、というのがこの画面。
  await emptyAuthenticator(page);
  // A link issued and not opened. The daemon answers `/auth/*` only to an
  // origin it knows, and on a host where nobody has registered yet the only
  // thing that makes this run's origin one is a registration waiting for it —
  // which is the state a person is in when they have been sent a link.
  await instance.passkey();
  await page.goto(instance.endpoint);
  await page.getByRole("button", { name: "接続" }).click();
  await expect(page.getByRole("heading", { name: "passkey で認証する" })).toBeVisible();
  await expect(page.getByText("登録 URL と 6 桁のコード")).toBeVisible();
  await shot(page, "sign-in.png");
});

test("register", async ({ ui: page, instance }) => {
  // A registration of its own, because the browser used the fixture's. What is
  // on screen is the same screen; the person it names is the second one this
  // instance has issued a link for.
  const { url } = await instance.passkey();
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "passkey を登録する" })).toBeVisible();
  await shot(page, "register.png");
  // Put the app back in front, so the screens after this one are not drawn
  // behind a registration nobody finished.
  await page.getByRole("button", { name: "やめる" }).click();
  await expect(page.getByRole("heading", { name: /^instance / })).toBeVisible();
});

test("sessions", async ({ ui: page, instance }) => {
  await page.goto(instance.endpoint);
  await expect(page.getByRole("heading", { name: /^instance / })).toBeVisible();
  await expect(page.getByRole("button", { name: /topic の畳み方/ })).toBeVisible();
  // 設定への入口は繋がっている時も居る。向こうの画面が instance に何も聞かない
  // ので、居てよい (DR-0001 §2.6)。
  await expect(page.getByRole("link", { name: "設定" })).toBeVisible();
  await shot(page, "sessions.png");
});

test("timeline", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  await expect(page.getByText("畳んだ値の読み方")).toBeVisible();
  await shot(page, "timeline.png");
});

test("timeline-fold-open", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  // 既定で閉じている畳み (会話でないものの並び) を開く。思考は既定で開いて
  // いるので、そこを押すと閉じる方が写る。
  const fold = page.locator("details.tl-fold > summary").first();
  await expect(fold).toBeVisible();
  await fold.click();
  await expect(page.locator("details.tl-fold[open]").first()).toBeVisible();
  await shot(page, "timeline-fold-open.png");
});

// 型付き item が答えられない唯一の問い — 元の行は何と書いてあったか — を、
// 押した所で取り寄せて出す。分類の甘い item ではこの入口が既定で見えている。
test("timeline-raw-record", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  const raw = page.locator("details.tl-raw > summary").last();
  await expect(raw).toBeVisible();
  await raw.click();
  await expect(page.locator("details.tl-raw[open] pre")).toContainText("uuid");
  await shot(page, "timeline-raw-record.png");
});

// 型ごとの表示属性。並ぶのは組み込みが名乗っている型と、この画面が実際に見た型
// (とその上の型) で、継いでいる値は薄く出る。
test("timeline-display", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  await expect(page.getByText("畳んだ値の読み方")).toBeVisible();
  await page.locator("details.tl-display > summary").click();
  await expect(page.getByRole("row", { name: /system\.unknown/ })).toBeVisible();
  await shot(page, "timeline-display.png");
});

// worker を主語にして開いた画面。並びは sub の面の既定 — 道具がトップ層に
// 1 行ずつ並び、本文は閉じている。
test("timeline-agent", async ({ ui: page, instance }) => {
  // 親から降りる: 起動した所がそのまま入口になっているかを、URL を打つのでは
  // なく押して確かめる。
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  await page.getByRole("link", { name: "この worker を開く" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/agent/${AGENT_ID}/timeline$`));
  await expect(page.getByRole("heading", { name: new RegExp(`worker ${AGENT_ID}`) })).toBeVisible();
  await expect(page.getByText("窓を持つのは")).toBeVisible();
  await shot(page, "timeline-agent.png");
});

test("timeline-search", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  await expect(page.getByText("畳んだ値の読み方")).toBeVisible();
  await page.getByRole("button", { name: "この画面の中を探す" }).click();
  await page.getByRole("textbox", { name: /探す言葉/ }).fill("instance 窓");
  await expect(page.locator("mark.search-hl").first()).toBeVisible();
  await shot(page, "timeline-search.png");
});

test("files-code", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/files?path=src/topic-fold.ts`);
  await expect(page.getByText("isFoldable")).toBeVisible();
  await shot(page, "files-code.png");
});

test("files-markdown", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/files?path=NOTES.md`);
  await expect(page.getByText("読み方のメモ")).toBeVisible();
  await shot(page, "files-markdown.png");
});

test("conversation", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  const composer = page.getByRole("textbox", { name: /送/ }).or(page.locator("textarea").last());
  await composer.fill("この topic の粒度、契約側の表を見て確かめてから直して。");
  await composer.scrollIntoViewIfNeeded();
  await shot(page, "conversation.png");
});

test("notification", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  // この画面が出るまでに、繋ぐ・購読する・最初の頁が届く、が順に起きる。段ごとに
  // 待つ — 最後の 1 つだけを待つと、手前の段が遅れた時に、何を待っていたのかを
  // 言わずに落ちる。接続が立っていることは下の送り直しの前提でもある (立って
  // いない所へ送っても届く先が無い)。
  await expect(page.locator(".app-bar")).toContainText("接続済み");
  await expect(page.getByRole("heading", { name: /transcript — / })).toBeVisible();
  await expect(page.getByText("畳んだ値の読み方")).toBeVisible();
  // 送って、出るまで送り直す。`notify` は**保持されない** topic なので、購読が
  // 立つ前や再接続の隙間に投げられた 1 通はそこで失われ、待っても戻ってこない
  // — 取り戻す手段は送り直すことしかない。回数ではなく「出たか」で終わるので、
  // 間隔を勘で決める必要もない。トーストが出す文面は毎回同じなので、2 通目が
  // 出た場合でも写るものは変わらない。
  await expect(async () => {
    await instance.notify(OTHER_SID, "基準画像の置き場が決まりました。");
    await expect(page.locator(".toast")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await shot(page, "notification.png");
});

/** 名前を略して書かれた語が、プロジェクトの中のファイルに繋がる所 (文書の
 * プレビュー)。綴りのまま在る語は単独のリンクになり、日付 prefix と拡張子を
 * 補って初めて名前が合う語は書類の印になる。何も当たらない語は素のまま —
 * 出るのは在った時だけなので、外れは画面に出ない。 */
test("file-word-candidates", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/files?path=NOTES.md`);
  await expect(page.getByText("読み方のメモ")).toBeVisible();
  const more = page.locator(".viewer-preview .md-file-word-more");
  await expect(more).toHaveCount(1);
  await more.click();
  await expect(
    page.getByRole("link", { name: "docs/issue/2026-09-14-fold-from-head.md" }),
  ).toBeVisible();
  await shot(page, "file-word-candidates.png");
});

/** 同じ繋がりを会話の吹き出しで。基準にする場所が違う (session の作業 folder)
 * だけで、出るものは同じ。 */
test("file-word-bubble", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/timeline`);
  await expect(page.getByText("畳んだ値の読み方")).toBeVisible();
  const word = page.locator(".tl-body .md-file-word");
  await expect(word.locator(".md-path-link")).toHaveCount(1);
  await expect(word.locator(".md-file-word-more")).toHaveCount(1);
  await word.locator(".md-file-word-more").click();
  await expect(
    page.getByRole("link", { name: "docs/issue/2026-09-14-fold-from-head.md" }),
  ).toBeVisible();
  await shot(page, "file-word-bubble.png");
});

/** 設定の画面。section の一覧で、今は色 1 つ — 組を選ぶ所と、触った結果を
 * 覚えるかどうかを決める所がある。画面自身が選んだ色で立っているので、見本は
 * 要らない。 */
test("settings", async ({ page, instance }) => {
  // **登録していないブラウザで入る**。この画面は instance に何も聞かないので
  // 繋がっていなくても立ち (DR-0001 §2.6)、帯の入口も繋ぐ前から居る。設定は
  // 色だけの画面ではなくなったので、入口の語も「設定」。
  //
  // 共有の `ui` を使わないのは、下の 3 つ目が読み込み直しを繰り返すから —
  // 共有の頁を揺らすと、後に走る画面が何を写すかまで変わる。
  await page.goto(instance.endpoint);
  await page.getByRole("link", { name: "設定" }).click();
  await expect(page).toHaveURL(new RegExp("/settings$"));
  await expect(page.getByRole("heading", { name: "色" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /暖色/ })).toBeVisible();
  // 何も触っていない所。覚えてある色と同じなので、差は 0 項で保存も押せない。
  await expect(page.getByText("覚えてあるもののまま")).toBeVisible();
  await expect(page.getByRole("button", { name: "保存" })).toBeDisabled();
  await shot(page, "settings.png");
});

/** 組を選んで、そこから 1 つ動かした所。ベースと違う項に印が付き、その行の
 * 「戻す」だけが押せる。 */
test("settings-changed", async ({ page, instance }) => {
  await page.goto(`${instance.endpoint}settings`);
  await page.getByRole("radio", { name: /暖色/ }).check();
  // 組を選んだ時点では、比べる先がその組なので差は無い。
  await expect(page.getByText("選んだ組のまま")).toBeVisible();
  // 意味色の色相は基本に出ていない (基本は face と色相 3 つだけ) ので、詳細を開く。
  await page.locator("details.theme-advanced > summary").click();
  const slider = page.getByRole("slider", { name: "危険 (danger) の色相" });
  await slider.fill("330");
  await expect(page.getByText("選んだ組と違うのは 1 項")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "危険 (danger) の色相をベースに戻す" }),
  ).toBeEnabled();
  await shot(page, "settings-changed.png");
});

/** 覚えるのは押した時だけ、ということ。絵は撮らない — ここで見たいのは**読み
 * 込み直した先に何が残っているか**で、それは画面の形には出ない。 */
test("settings-keeps-and-forgets", async ({ page, instance }) => {
  await page.goto(`${instance.endpoint}settings`);
  const open = async () => {
    await page.locator("details.theme-advanced > summary").click();
  };
  await open();
  const danger = page.getByRole("slider", { name: "危険 (danger) の色相" });
  const before = await danger.inputValue();

  // 保存せずに離れる: 読み込み直すと元に戻っている。
  await danger.fill("300");
  await expect(danger).toHaveValue("300");
  await page.reload();
  await open();
  await expect(danger).toHaveValue(before);

  // 保存してから離れる: 読み込み直しても残っている。
  await danger.fill("300");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("覚えてあるもののまま")).toBeVisible();
  await page.reload();
  await open();
  await expect(danger).toHaveValue("300");

  // 覚えた値は**それ自体がベースになる**ので、項ごとの「戻す」では消せない
  // (比べる先が自分自身になっている)。何も選んでいない所へ帰る道は「標準」の
  // 組で、それを保存することが「覚えたものを捨てる」。
  await expect(
    page.getByRole("button", { name: "危険 (danger) の色相をベースに戻す" }),
  ).toBeDisabled();
  await page.getByRole("radio", { name: /標準/ }).check();
  await page.getByRole("button", { name: "保存" }).click();
  await page.reload();
  await open();
  await expect(danger).toHaveValue(before);
});
