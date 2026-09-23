import type { Browser, Page } from "@playwright/test";
import { expect, test } from "./harness.ts";

/** webui の SW が頁の応答に COOP を足し、sandbox を継いだ別窓がそれで塞がるか
 * (DR-0005 §2.2)。
 *
 * ここも絵を比べない。確かめたいのは応答の header と、ブラウザがそれをどう扱ったか
 * で、どちらも画面には写らない。
 *
 * 使うのは**登録していない browser** (`page` / 自前の context): SW の登録は context
 * ごとの物なので、共有の頁で確かめると「初めて開いた時は付かない」が言えない。 */

const COOP = "cross-origin-opener-policy";

test("SW が動き出した後の navigation には COOP が付く", async ({ page, instance }) => {
  // 最初の頁は SW の登録より前に届くので、付いていない — 付いていれば、それは
  // SW ではなく配信元が付けた物で、この test は何も確かめていないことになる。
  const first = await page.goto(instance.endpoint);
  expect(first?.fromServiceWorker()).toBe(false);
  expect(first?.headers()[COOP]).toBeUndefined();

  // 登録 → activate → claim。最初の頁も制御下に入る。
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  const second = await page.reload();
  expect(second?.fromServiceWorker()).toBe(true);
  expect(second?.headers()[COOP]).toBe("same-origin");
});

test("sandbox を継いだ別窓は webui の頁を読み込めない", async ({ browser, instance }) => {
  // 同じ手順を SW の有無だけ変えて 2 度踏む。塞がったのが COOP のせいだと言うには、
  // SW が居なければ開けることも見ておく。
  const at = { endpoint: instance.endpoint, content: `${instance.viewOrigin}/` };
  expect(await popupFromSandbox(browser, at, "block")).toBe("loaded");
  expect(await popupFromSandbox(browser, at, "allow")).toBe("blocked");
});

/** 閲覧 iframe と同じ sandbox (`allow-scripts allow-same-origin allow-popups`) の中から
 * `_blank` で webui の URL を開き、別窓に何が載ったかを返す。
 *
 * 中身は閲覧 site の頁 (起動の頁、読み込まれただけでは何もしない) を借りる。要るのは
 * webui と別 site であることだけ — 同じ origin の中身なら COOP の same-origin を
 * 満たしてしまい、何も確かめられない。 */
async function popupFromSandbox(
  browser: Browser,
  at: { readonly endpoint: string; readonly content: string },
  serviceWorkers: "allow" | "block",
): Promise<"loaded" | "blocked"> {
  const context = await browser.newContext({ serviceWorkers });
  try {
    const page = await context.newPage();
    await page.goto(at.endpoint);
    if (serviceWorkers === "allow") {
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    }
    await page.evaluate((content: string) => {
      const frame = document.createElement("iframe");
      frame.id = "content";
      frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups");
      frame.src = content;
      document.body.append(frame);
    }, at.content);
    const frame = page.frameLocator("#content");
    // 中身が置いたリンクを人が押した形にする。押されたのは sandbox の中なので、
    // 開く別窓は sandbox を継ぐ (`allow-popups-to-escape-sandbox` を付けていない)。
    await frame.locator("body").evaluate((body: HTMLElement, target: string) => {
      const link = document.createElement("a");
      link.id = "out";
      link.href = target;
      link.target = "_blank";
      link.textContent = "webui を開く";
      body.append(link);
    }, at.endpoint);
    const popped = page.waitForEvent("popup");
    await frame.locator("#out").click();
    return await landed(await popped);
  } finally {
    await context.close();
  }
}

/** 別窓に webui が描かれたか、ブラウザのエラー頁か。 */
async function landed(popup: Page): Promise<"loaded" | "blocked"> {
  await popup.waitForLoadState();
  if (popup.url().startsWith("chrome-error:")) return "blocked";
  await expect(popup.locator("#app")).toBeAttached();
  return "loaded";
}
