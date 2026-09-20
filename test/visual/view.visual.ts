import { expect } from "@playwright/test";
import { SID } from "./fixture.ts";
import { connected, test } from "./harness.ts";

/** 閲覧 site が本当に描くか (DR-0005)。
 *
 * ここだけは絵を比べない。確かめたいのは**バイト列が届いて、ブラウザが素で
 * 描いたか**で、それは「何色の四角が写ったか」ではなく、描かれた要素が自分の
 * 大きさを持っているかで言える (`naturalWidth` は中身を読めた時だけ立つ)。
 *
 * 通っている道は本物と同じ: 別 site の静的配信 → Service Worker の横取り →
 * `MessageChannel` → 親頁 → `file.read`。どこか 1 つでも欠ければ絵は出ない。 */

/** 描かれた画像が持っている幅。fixture の PNG そのものの大きさ (16×16)。 */
const FIGURE_WIDTH = 16;

test("画像が閲覧 site 越しに描かれる", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/files?path=docs/fig.png`);
  await connected(page);
  // 窓は 2 枚 — 親が置く iframe (起動の頁) と、その中に起動の頁が置く中身。
  // ポートを渡してから中身を頼む順番を、入れ子そのもので決めている。
  const figure = page.frameLocator(".viewer-frame").frameLocator(".content").locator("img");
  await expect(figure).toBeVisible();
  await expect
    .poll(() => figure.evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 15_000 })
    .toBe(FIGURE_WIDTH);
});

test("HTML の相対参照も同じ横取りが拾う", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/files?path=docs/page.html`);
  await connected(page);
  const inner = page.frameLocator(".viewer-frame").frameLocator(".content");
  await expect(inner.locator("h1")).toHaveText("図のある頁");
  // `<img src="./fig.png">` は `/view/<sid>/contained/docs/fig.png` として
  // 引かれる。同じ scope なので、同じ横取りが同じように拾う (§2.4)。
  await expect
    .poll(() => inner.locator("#figure").evaluate((img: HTMLImageElement) => img.naturalWidth), {
      timeout: 15_000,
    })
    .toBe(FIGURE_WIDTH);
});

test("直接開いた閲覧 site は何も答えない", async ({ page, instance }) => {
  // URL を人に送られても、ブックマークされても、ポートが無ければ届く物は無い
  // (§2.6)。ここに居るのは親を持たないただの頁。
  await page.goto(`${instance.viewOrigin}/view/${SID}/contained/docs/fig.png`);
  await expect(page.locator("body")).toHaveText("この頁は単独では何も映しません。");
  await expect(page.locator("img")).toHaveCount(0);
});
