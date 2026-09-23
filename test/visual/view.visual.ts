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

test("同じファイルを開き直すと異なる origin になる", async ({ ui: page, instance }) => {
  const file = `${instance.endpoint}s/${SID}/files?path=docs/fig.png`;
  await page.goto(file);
  await connected(page);
  const first = new URL((await page.locator(".viewer-frame").getAttribute("src")) ?? "").origin;
  await page.goto(`${instance.endpoint}s/${SID}/files`);
  await page.goto(file);
  const second = new URL((await page.locator(".viewer-frame").getAttribute("src")) ?? "").origin;
  expect(first).not.toBe(second);
  expect(first).toMatch(/^http:\/\/ccmsg-view-[\da-f-]+\.localhost:45875$/);
});

test("素の起動頁は登録せず、片付けると origin の持ち物を消す", async ({ ui: page, instance }) => {
  await page.goto(instance.endpoint);
  const id = crypto.randomUUID();
  const origin = `http://ccmsg-view-${id}.localhost:45875`;
  await page.evaluate(async (at) => {
    const node = document.createElement("iframe");
    node.className = "cleanup-probe";
    node.sandbox.add("allow-scripts", "allow-same-origin");
    const ready = new Promise<void>((resolve) => {
      const heard = (event: MessageEvent) => {
        if (
          event.origin !== at ||
          event.source !== node.contentWindow ||
          event.data?.ccmsg !== "ccmsg-view-ready"
        )
          return;
        removeEventListener("message", heard);
        resolve();
      };
      addEventListener("message", heard);
    });
    node.src = `${at}/`;
    document.body.append(node);
    await ready;
  }, origin);
  expect(
    await page
      .frameLocator("iframe.cleanup-probe")
      .locator("body")
      .evaluate(() => navigator.serviceWorker.getRegistrations().then((all) => all.length)),
  ).toBe(0);
  await page
    .frameLocator("iframe.cleanup-probe")
    .locator("body")
    .evaluate(async () => {
      localStorage.setItem("probe", "value");
      sessionStorage.setItem("probe", "value");
      const cache = await caches.open("probe");
      await cache.put("/probe", new Response("value"));
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("probe", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      const root = await navigator.storage.getDirectory();
      await root.getFileHandle("probe", { create: true });
      document.cookie = "probe=value; Path=/";
      document.cookie = "shared=value; Path=/; Domain=localhost";
      await navigator.serviceWorker.register("/sw.js", { type: "module", scope: "/" });
    });
  const cleaned = await page.evaluate(async (at) => {
    const node = document.querySelector<HTMLIFrameElement>("iframe.cleanup-probe");
    if (!node) return false;
    const path = "/src/files/view-ledger.ts";
    const { requestClean } = await import(/* @vite-ignore */ path);
    return requestClean(node, at);
  }, origin);
  expect(cleaned).toBe(true);
  expect(
    await page
      .frameLocator("iframe.cleanup-probe")
      .locator("body")
      .evaluate(async () => ({
        registrations: (await navigator.serviceWorker.getRegistrations()).length,
        local: localStorage.length,
        session: sessionStorage.length,
        databases: (await indexedDB.databases()).length,
        caches: (await caches.keys()).length,
        files: (await Array.fromAsync((await navigator.storage.getDirectory()).keys())).length,
        cookies: document.cookie,
      })),
  ).toEqual({
    registrations: 0,
    local: 0,
    session: 0,
    databases: 0,
    caches: 0,
    files: 0,
    cookies: "",
  });
});

test("残った台帳は新しい起動頁からの nonce 付き応答で消える", async ({ ui: page, instance }) => {
  await page.goto(instance.endpoint);
  const id = crypto.randomUUID();
  const key = `ccmsg.view:${id}`;
  await page.evaluate(
    ({ key }) => localStorage.setItem(key, String(Date.now() - 2 * 60 * 60_000)),
    { key },
  );
  await page.evaluate(async () => {
    const path = "/src/files/view-ledger.ts";
    const { sweepViews } = await import(/* @vite-ignore */ path);
    await sweepViews("localhost:45875");
  });
  expect(await page.evaluate(({ key }) => localStorage.getItem(key), { key })).toBeNull();
  expect(await page.locator("iframe[hidden]").count()).toBe(0);
});

test("閲覧側の偽応答は台帳を消さず、開いている間の印は掃除を止める", async ({
  ui: page,
  instance,
}) => {
  await page.goto(instance.endpoint);
  const id = crypto.randomUUID();
  const key = `ccmsg.view:${id}`;
  const age = String(Date.now() - 2 * 60 * 60_000);
  await page.evaluate(({ key, age }) => localStorage.setItem(key, age), { key, age });
  const origin = `http://ccmsg-view-${id}.localhost:45875`;
  await page.evaluate((at) => {
    const frame = document.createElement("iframe");
    frame.className = "forged-view";
    frame.src = `${at}/`;
    frame.sandbox.add("allow-scripts", "allow-same-origin");
    document.body.append(frame);
  }, origin);
  await expect(page.locator("iframe.forged-view")).toHaveAttribute("src", `${origin}/`);
  await page
    .frameLocator("iframe.forged-view")
    .locator("body")
    .evaluate(() => {
      window.parent.postMessage({ ccmsg: "ccmsg-view-cleaned", nonce: "fake" }, "*");
    });
  expect(await page.evaluate(({ key }) => localStorage.getItem(key), { key })).toBe(age);
  await page.evaluate(
    async ({ key }) => {
      localStorage.setItem(key, String(Date.now()));
      const path = "/src/files/view-ledger.ts";
      const { sweepViews } = await import(/* @vite-ignore */ path);
      await sweepViews("localhost:45875");
    },
    { key },
  );
  expect(await page.evaluate(({ key }) => localStorage.getItem(key), { key })).not.toBeNull();
});

test("中身から送った別ポートは SW の親を差し替えない", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/files?path=docs/page.html`);
  await connected(page);
  const inner = page.frameLocator(".viewer-frame").frameLocator(".content");
  await expect(inner.locator("h1")).toHaveText("図のある頁");
  const result = await inner.locator("body").evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const channel = new MessageChannel();
    registration.active?.postMessage({ ccmsg: "ccmsg-view-port" }, [channel.port2]);
    const response = await fetch("./fig.png");
    return {
      status: response.status,
      type: response.headers.get("content-type"),
      csp: response.headers.get("content-security-policy"),
      size: (await response.arrayBuffer()).byteLength,
    };
  });
  expect(result.status).toBe(200);
  expect(result.type).toBe("image/png");
  expect(result.csp).toContain("worker-src 'self'");
  expect(result.size).toBeGreaterThan(0);
});

test("閉じる副経路は iframe を外すが台帳は消さない", async ({ ui: page, instance }) => {
  await page.goto(`${instance.endpoint}s/${SID}/files?path=docs/fig.png`);
  await connected(page);
  const frame = page.locator("iframe.viewer-frame");
  await expect(
    page.frameLocator(".viewer-frame").frameLocator(".content").locator("img"),
  ).toBeVisible();
  const origin = new URL((await frame.getAttribute("src")) ?? "").origin;
  const id = origin.match(/ccmsg-view-([\da-f-]+)\./)?.[1];
  expect(id).toBeDefined();
  const key = `ccmsg.view:${id}`;
  expect(await page.evaluate((entry) => localStorage.getItem(entry), key)).not.toBeNull();
  await page.evaluate(async () => {
    const path = "/src/state.ts";
    const { navigate } = await import(/* @vite-ignore */ path);
    navigate({ at: "sessions" });
  });
  await expect.poll(() => page.locator("iframe.viewer-frame").count()).toBe(0);
  expect(await page.evaluate((entry) => localStorage.getItem(entry), key)).not.toBeNull();
});

test("直接開いた閲覧 site は何も答えない", async ({ page, instance }) => {
  // URL を人に送られても、ブックマークされても、ポートが無ければ届く物は無い
  // (§2.6)。ここに居るのは親を持たないただの頁。
  await page.goto(`${instance.viewOrigin}/view/${SID}/contained/docs/fig.png`);
  await expect(page.locator("body")).toHaveText("この頁は単独では何も映しません。");
  await expect(page.locator("img")).toHaveCount(0);
});
