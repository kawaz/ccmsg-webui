import { expect, test as base, type Page } from "@playwright/test";
import {
  BULK_SID,
  JOIN_SID,
  OTHER_SID,
  SID,
  STATUS_SID,
  TAIL_SID,
  writeFixture,
} from "./fixture.ts";
import { type Instance, startInstance } from "./instance.ts";
import { type FakeSession, greetAsSession } from "./session.ts";

/** What every visual test runs against: one disposable instance with a fixture
 * transcript and two sessions greeting it, and one browser that has registered
 * a passkey against it.
 *
 * Both are worker-scoped, and that is not only about cost. Who this browser is
 * is held in two places a fresh context would drop — the credential inside the
 * virtual authenticator, and the refresh cookie the daemon set — so every
 * screen drawn after the registration has to be drawn in the same browser.
 *
 * **The registration happens here rather than in a test**, because everything
 * after it depends on it and a test is allowed to fail. Downstream of a failing
 * assertion, the registration would not run at all, and every later screen
 * would quietly become the sign-in screen: one broken thing would be reported
 * as many. Setup that fails stops the run at the thing that is actually wrong.
 *
 * The screens this cannot draw are the two an unregistered browser sees — the
 * one it opens on, and the one pressing 接続 leads to. Those tests take the
 * built-in `page` instead: a context of its own is an unregistered browser. */

export interface Fixtures {
  instance: Instance;
  ui: Page;
  phone: Page;
  usage: Page;
}

export const test = base.extend<object, Fixtures>({
  instance: [
    // Playwright reads what a fixture depends on off this destructuring
    // pattern, and requires the pattern even when the answer is nothing: the
    // instance is what everything else depends on, and depends on none of them.
    // oxlint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const instance = await startInstance();
      const fixture = writeFixture(instance.home, instance.cwd);
      const sessions: FakeSession[] = [];
      try {
        sessions.push(
          await greetAsSession(instance.stateDir, {
            sid: SID,
            cwd: instance.cwd,
            transcriptPath: fixture.transcriptPath,
            title: "topic の畳み方を書く",
            repo: "kawaz/ccmsg-webui",
            branch: "main",
            model: "claude-opus-5",
          }),
          await greetAsSession(instance.stateDir, {
            sid: OTHER_SID,
            cwd: instance.cwd,
            transcriptPath: fixture.phoneTranscriptPath,
            title: "基準画像の置き場を決める",
            repo: "kawaz/ccmsg-webui",
            branch: "main",
            model: "claude-sonnet-5",
          }),
          await greetAsSession(instance.stateDir, {
            sid: STATUS_SID,
            cwd: instance.cwd,
            transcriptPath: fixture.statusTranscriptPath,
            title: "束 0 を片付ける",
            repo: "kawaz/ccmsg-webui",
            branch: "main",
            model: "claude-opus-5",
          }),
          await greetAsSession(instance.stateDir, {
            sid: JOIN_SID,
            cwd: instance.cwd,
            transcriptPath: fixture.joinTranscriptPath,
            title: "頁をまたぐ呼びと答え",
            repo: "kawaz/ccmsg-webui",
            branch: "main",
            model: "claude-sonnet-5",
          }),
          await greetAsSession(instance.stateDir, {
            sid: BULK_SID,
            cwd: instance.cwd,
            transcriptPath: fixture.bulkTranscriptPath,
            title: "長い transcript",
            repo: "kawaz/ccmsg-webui",
            branch: "main",
            model: "claude-sonnet-5",
          }),
          await greetAsSession(instance.stateDir, {
            sid: TAIL_SID,
            cwd: instance.cwd,
            transcriptPath: fixture.tailTranscriptPath,
            title: "追記を見る",
            repo: "kawaz/ccmsg-webui",
            branch: "main",
            model: "claude-sonnet-5",
          }),
        );
        await use(instance);
      } finally {
        for (const one of sessions) one.close();
        await instance.stop();
      }
    },
    { scope: "worker" },
  ],
  ui: [
    async ({ browser, instance }, use) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await addAuthenticator(page);
      const { url, code } = await instance.passkey();
      await page.goto(url);
      await register(page, code);
      await use(page);
      await context.close();
    },
    { scope: "worker" },
  ],
  // 時計を留めたブラウザ。使用量の画面に出ているのは残り時間と齢なので、
  // 走った時刻が基準画像に写らないよう、ページの `Date.now()` を gateway の
  // 文書が刻むのと同じ instant に固定する。留めた時計は文脈ごと分けて持つ:
  // 共有のページに仕込むと、後から撮る画面の時計まで止まる。
  usage: [
    async ({ browser, instance }, use) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await pinClock(page, instance.gatewayBase);
      await addAuthenticator(page);
      const { url, code } = await instance.passkey();
      await page.goto(url);
      await register(page, code);
      await use(page);
      await context.close();
    },
    { scope: "worker" },
  ],
  // The same browser at the size most of these screens are actually read at.
  // A context of its own rather than the desktop one resized, because who a
  // browser is lives in its context: resizing would make the phone screens
  // depend on a viewport a failing test could leave behind.
  phone: [
    async ({ browser, instance }, use) => {
      const context = await browser.newContext({
        viewport: PHONE,
        deviceScaleFactor: 1,
        isMobile: false,
      });
      const page = await context.newPage();
      await addAuthenticator(page);
      const { url, code } = await instance.passkey();
      await page.goto(url);
      await register(page, code);
      await use(page);
      await context.close();
    },
    { scope: "worker" },
  ],
});

export { expect };

/** The narrow screen these are read on. 375 css px is the width of the phones
 * this is carried on, and the one number a layout that fits nothing else has
 * to fit. */
export const PHONE = { width: 375, height: 667 } as const;

/** Nothing on the page is wider than the window.
 *
 * The assertion the width bugs are really about: a picture shows a layout that
 * broke, and this says which element broke it. Reported by name rather than as
 * a boolean, so a failure names the thing to fix. */
export async function nothingOverflows(page: Page): Promise<void> {
  const wide = await page.evaluate(() => {
    const room = document.documentElement.clientWidth;
    // What is inside something that scrolls sideways is allowed to be wide —
    // that is what the scroll is for, and a code block wider than the phone is
    // the point of putting one there. What has to fit is the scroller itself.
    const scrolls = (one: Element): boolean => {
      const how = getComputedStyle(one).overflowX;
      return how === "auto" || how === "scroll";
    };
    const inside = (one: Element): boolean => {
      for (let at = one.parentElement; at !== null; at = at.parentElement) {
        if (scrolls(at)) return true;
      }
      return false;
    };
    const over: string[] = [];
    for (const one of document.querySelectorAll("*")) {
      const box = one.getBoundingClientRect();
      if (box.right <= room + 0.5 && box.width <= room + 0.5) continue;
      if (inside(one)) continue;
      over.push(
        `${one.tagName.toLowerCase()}.${one.className.toString().split(" ").join(".")} ${String(Math.round(box.width))}px @${String(Math.round(box.left))}`,
      );
    }
    return { room, over: over.slice(0, 12), scrollWidth: document.documentElement.scrollWidth };
  });
  expect(wide.over, `window ${String(wide.room)}px を超えている要素`).toEqual([]);
  expect(wide.scrollWidth).toBeLessThanOrEqual(wide.room + 1);
}

/** このページの「今」を 1 点に留める。
 *
 * `Date.now()` と引数無しの `new Date()` だけを差し替える: 画面が時刻を読むのは
 * その 2 つで、日付の算術 (差の計算・書式) は本物のまま動く。留める先を本物の
 * 今から遠ざけないのは、daemon が出す期限と噛み合わせたままにするため。 */
async function pinClock(page: Page, at: number): Promise<void> {
  await page.addInitScript((pinned: number) => {
    const Original = Date;
    const Pinned = class extends Original {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(pinned);
        else super(...(args as []));
      }

      static override now(): number {
        return pinned;
      }
    };
    (globalThis as { Date: unknown }).Date = Pinned;
  }, at);
}

/** Give this browser a passkey it can answer with, without a person touching
 * anything.
 *
 * The virtual authenticator is the browser's own, driven over CDP: what the
 * page calls is `navigator.credentials`, and every byte it produces goes
 * through the daemon's real verification. Nothing about the registration is
 * stubbed — only the finger. */
async function addAuthenticator(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

/** Give this browser an authenticator holding nothing.
 *
 * What a phone that has never registered here is: asked for a passkey it
 * answers that it has none, which is the refusal the page turns into the
 * registration guidance. Without one at all the browser would be answering for
 * a machine with no authenticator, which is not what anybody is carrying. */
export async function emptyAuthenticator(page: Page): Promise<void> {
  await addAuthenticator(page);
}

/** Finish the registration screen this page is on, and wait for the app behind
 * it. */
export async function register(page: Page, code: string): Promise<void> {
  await page.getByLabel("CLI が表示した 6 桁のコード").fill(code);
  await page.getByLabel("この端末の名前").fill("visual runner");
  await page.getByRole("button", { name: "登録する" }).click();
  await expect(page.getByRole("heading", { name: /^instance / })).toBeVisible();
}

/** Take one screenshot, with what the page cannot draw the same way twice
 * covered over.
 *
 * `animations: "allow"` is for the one screen whose subject IS an animation:
 * the cache ring is drawn by a CSS animation, and the default (finishing every
 * finite animation before the shot) would draw it as the empty ring it becomes
 * when the window closes. Its window is an hour, so the fraction of it that
 * passes between two runs' shots is far below one pixel of arc.
 *
 * Two of the three are in the connection bar, and none is about a screen:
 *
 * - `.meta` carries who this browser is and **how long its access lasts**, and
 *   the second half of that counts down
 * - `.footer` names the **daemon's version**, which belongs to another
 *   repository's release cadence — left uncovered, every ccmsg release would
 *   redraw all of these baselines while nothing about the page had changed
 * - `.host` on a mesh row is the **machine this ran on**, which is the one
 *   thing on these screens the run cannot fix: a baseline drawn on one host
 *   would fail on every other one
 * - `.status-item .meta` is **how long something has been running**, which is a
 *   number that grows while the picture is being taken
 *
 * A mask keeps the element's own box, so the bar moving or changing size still
 * fails; what is given up is the text inside those few hundred pixels.
 *
 * Everything else on screen is deterministic by construction rather than by
 * being hidden: the instance id is seeded, the transcript is a fixture with
 * fixed instants, and the endpoint is this run's fixed port. */
export async function shot(
  page: Page,
  name: string,
  options: { readonly animations?: "allow" | "disabled" } = {},
): Promise<void> {
  await fontsReady(page);
  await expect(page).toHaveScreenshot(name, {
    mask: [
      page.locator(".bar .meta"),
      page.locator(".bar .footer"),
      page.locator(".host"),
      // 走っているものの経過時間。走っている限り増え続けるので、絵にすると
      // 撮った瞬間が写る。
      page.locator(".status-item .meta"),
      // 探して見つけた行が持つ **file の更新時刻**。走らせた時刻そのものなので、
      // 同じ理由で覆う (id と大きさは動かないが、同じ帯に並んでいる)。
      page.locator(".hit .meta"),
    ],
    ...(options.animations === undefined ? {} : { animations: options.animations }),
  });
}

/** Wait for the fonts the page asked for.
 *
 * The rest of "has it stopped moving" is `toHaveScreenshot`'s own: it takes the
 * picture again until two in a row are the same, which is the thing being
 * waited for rather than a guess at how long it takes. */
export async function fontsReady(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}
