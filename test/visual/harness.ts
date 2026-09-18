import { type Browser, expect, test as base, type Page } from "@playwright/test";
import {
  BULK_SID,
  DUP_SID,
  JOIN_SID,
  OTHER_SID,
  SID,
  STATUS_SID,
  TAIL_SID,
  writeFixture,
} from "./fixture.ts";
import { type Instance, startInstance } from "./instance.ts";
import { type FakeSession, greetAsSession } from "./session.ts";
import { type DuplicateRuns, startDuplicateRuns } from "./runs.ts";
import { startTerminals, type TerminalFixture, TERMINAL_SID } from "./terminals.ts";

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
  settings: Page;
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
      // 走り続ける 2 プロセスと、その状態ファイル。一覧にも `runs` の画面にも
      // 出るので、fixture が最初から持つ — test の中で作って消すと、その前後に
      // 撮る絵がどの瞬間に撮られたかで変わる。
      let twofold: DuplicateRuns | undefined;
      // 端末たち。1 つには本物の run が居るので、一覧とセッションの結び付きは
      // pid の突き合わせ (契約 DR-0026) をそのまま通る。
      let terminals: TerminalFixture | undefined;
      try {
        twofold = startDuplicateRuns(instance.home, DUP_SID, instance.cwd);
        terminals = startTerminals(instance.home, instance.terminalListing, instance.cwd);
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
            sid: DUP_SID,
            cwd: instance.cwd,
            transcriptPath: fixture.duplicateTranscriptPath,
            title: "二重に走っているセッション",
            repo: "kawaz/ccmsg-webui",
            branch: "main",
            model: "claude-sonnet-5",
          }),
          await greetAsSession(instance.stateDir, {
            sid: TERMINAL_SID,
            cwd: instance.cwd,
            transcriptPath: fixture.terminalTranscriptPath,
            title: "端末で動いているセッション",
            repo: "kawaz/ccmsg-webui",
            branch: "main",
            model: "claude-opus-5",
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
        twofold?.stop();
        terminals?.stop();
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
  // 設定を触るブラウザ。**共有の `ui` と分ける** — 設定の test は覚えたものを
  // 読み込み直して確かめるので、頁を揺らし、色まで保存する。共有の頁でやると
  // 「後に撮る絵ぜんぶ」がその色で焼き込まれ、基準画像が走った順番に依存する。
  settings: [
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

/** 本文を動かす箱。
 *
 * 縦に動くのは頁ではなく 2 ペインのそれぞれなので (`src/layout/scroller.ts`)、
 * test が本文を動かす時も、どこに居るかを読む時もこの箱に言う。頁に言っても
 * 何も動かない — 動かないことは「まだ届いていない」と見分けが付かないので、
 * 名前を 1 か所に置いて言い間違えないようにする。 */
const BODY = ".pane-main";

/** 本文を先頭まで戻す。 */
export async function scrollBodyToTop(page: Page): Promise<void> {
  await page.evaluate((where: string) => {
    document.querySelector(where)?.scrollTo(0, 0);
  }, BODY);
}

/** transcript の窓を上端に**居続けさせて**、手前の 1 頁を頼む。
 *
 * 頼みが起きるのは「上端に着いた」という出来事だが、頁が届くと、見ている行を
 * 動かさないために位置が戻される。1 度きりの移動だと、その戻しが**出来事が
 * 配られる前**に走ることがあり (同じ frame の中で 0 と戻し先が書かれると、
 * 届く scroll は後に書いた方 1 つだけになる)、上端に居たことが誰にも伝わらない
 * まま、待つ側だけが待ち続ける。
 *
 * だから 1 度動かして終わりにせず、**頼みが届くまで上端に居させる**。届いたこと
 * は端の 1 行が言い (「読み込み中…」、遡り切っていれば「— 先頭 —」)、届いた頁は
 * 見出しの数が言う — どちらかが動いた所で手を離す。 */
export async function holdTimelineAtTop(page: Page): Promise<void> {
  const was = (await page.locator(".timeline h2").textContent()) ?? "";
  await page.waitForFunction(
    ({ was: before, where }: { was: string; where: string }) => {
      if (document.querySelector(".timeline h2")?.textContent !== before) return true;
      const edge = document.querySelector(".tl-edge")?.textContent ?? "";
      if (edge.includes("読み込み中") || edge.includes("先頭")) return true;
      document.querySelector(where)?.scrollTo(0, 0);
      return false;
    },
    { was, where: BODY },
  );
}

/** 本文が今どこに居るか。 */
export async function bodyScrollTop(page: Page): Promise<number> {
  return await page.evaluate(
    (where: string) => document.querySelector(where)?.scrollTop ?? -1,
    BODY,
  );
}

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
      // 切っている箱も同じ扱い: 中がどれだけ広くても、窓の外へは出ない。
      // 狭い画面の 2 ペインは「並んだまま横へ滑る」形なので、並びの幅は
      // 窓の 2 倍あるが、見えるのは常に 1 枚ぶん。
      return how === "auto" || how === "scroll" || how === "clip" || how === "hidden";
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

/** 自分の passkey と自分の cookie を持つ、使い捨ての browser。
 *
 * 共有の `ui` と分け合えない test のためのもの: ログアウトも family の失効も
 * **その browser が二度と繋がらない状態**を作るので、後に走る画面と同じ文脈で
 * 起こすと、壊れたのがどの test かを言えなくなる。登録はここで済ませるので、
 * 返ってくるのは既に繋がっている頁。 */
export async function ownBrowser(browser: Browser, instance: Instance): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await addAuthenticator(page);
  const { url, code } = await instance.passkey();
  await page.goto(url);
  await register(page, code);
  return page;
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
 * Two of them are on the account screen, and none is about a screen:
 *
 * - `.connection-until` is **when this connection's authorization runs out**,
 *   which is a clock reading that moves while the picture is being taken
 * - `.daemon-version` names the **daemon's version**, which belongs to another
 *   repository's release cadence — left uncovered, every ccmsg release would
 *   redraw all of these baselines while nothing about the page had changed
 * - `.host` on a mesh row is the **machine this ran on**, which is the one
 *   thing on these screens the run cannot fix: a baseline drawn on one host
 *   would fail on every other one
 * - `.status-item .meta` is **how long something has been running**, which is a
 *   number that grows while the picture is being taken
 * - `.spend-row .usage-key` is **the day a bucket is**, which is the day the run
 *   happened
 * - `.dump-path` is **where a dump landed**: a path on this host, named after
 *   the moment it was written
 * - `.launch-cwd` holds **absolute paths on this host**, spelled differently on
 *   each operating system
 *
 * A mask keeps the element's own box, so the bar moving still fails; what is
 * given up is the text inside those few hundred pixels. 覆う文字が走るたびに
 * 変わる所は、箱の幅まで文字に付いて動いてしまうので、その幅は撮る間だけ
 * 決め打ちにする (`screenshot.css`)。
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
  await listSettled(page);
  await stillness(page);
  await expect(page).toHaveScreenshot(name, {
    mask: [
      page.locator(".connection-until"),
      page.locator(".daemon-version"),
      page.locator(".host"),
      // 走っているものの経過時間。走っている限り増え続けるので、絵にすると
      // 撮った瞬間が写る。
      page.locator(".status-item .meta"),
      // 探して見つけた行が持つ **file の更新時刻**。走らせた時刻そのものなので、
      // 同じ理由で覆う (id と大きさは動かないが、同じ帯に並んでいる)。
      // 畳んである間も箱は残る (閉じた `details` の中身は隠れているだけ) ので、
      // **開いている時だけ**覆う — 閉じたままの入口を覆うと、その裏の行まで
      // 塗り潰してしまう。
      page.locator(".search-sessions[open] .hit .meta"),
      // 費用の行が持つ**束の名前** (日付)。走らせた日そのものなので、絵にすると
      // 翌日には合わなくなる (棒の高さは何日前かで決まるので動かない)。
      page.locator(".spend-row .usage-key"),
      // 起動の画面が出す **host の絶対パス**。使い捨ての場所は OS で綴りが違う
      // (macOS の temp と Linux の temp)、`.host` と同じ理由で覆う。
      page.locator(".launcher[open] .launch-cwd"),
      // 書き出した file の場所。host の綴りと、書いた時刻が入っている。
      page.locator(".dump-path"),
      // run の pid と起動時刻。pid は OS が配る番号そのもの、起動時刻はその
      // プロセスが立った瞬間なので、どちらも走るたびに変わる。
      // transcript の行が持つ**どのくらい前か**。fixture の時刻は固定でも、
      // 引き算の相手は撮った瞬間なので走るたびに変わる。
      page.locator(".tl-when"),
      page.locator(".run-pid"),
      page.locator(".run-when"),
      // そのセッションの inbox で**今**待っている通数。届いた 1 通が相手に
      // 渡る瞬間は instance が決めるので、走らせるたびに違う瞬間が写る。席は
      // 常に置いてあるので (`.waiting-slot`)、覆っても行の組み方は写る。
      page.locator(".waiting-badge"),
    ],
    ...(options.animations === undefined ? {} : { animations: options.animations }),
  });
}

/** 話し相手が居ること。
 *
 * 接続後の画面に帯は無いので (DR-0004 §2.4)、それを言うのは道の中の小部品
 * 1 つになる。語ではなく class で読むのは、印が言うのも色と形だから。 */
export async function connected(page: Page): Promise<void> {
  await expect(page.locator(".status-mark.open")).toBeVisible();
}

/** 一覧が「届くべきものを受け取り切った」と言うまで待つ。
 *
 * 待つのは**状態**で、時間ではない: 画面は受け取った snapshot から
 * `data-settled` を導いていて (`src/state.ts` の `listSettled`)、起動しただけの
 * ハーネスの行はそこが立って初めて出揃う。立つ前に撮ると、行が届く前後のどちら
 * が写るかが走るたびに変わる。
 *
 * 一覧が出ていない画面 (設定・登録・狭い画面の本文) には待つものが無い。
 *
 * `shot()` は撮る前にこれを通るが、**行を選んでから撮る test は自分で待つ**
 * — 「いちばん下の行」や「一覧の高さ」は、届き切る前だと別のものを指す。 */
export async function listSettled(page: Page): Promise<void> {
  const list = page.locator(".pane-list");
  if ((await list.count()) === 0) return;
  await expect(list).toHaveAttribute("data-settled", "");
}

/** 動いているものが止まるまで待つ。
 *
 * 待つのは**出来事**で、時間ではない: 本文を動かす箱の位置が 2 frame 続けて
 * 同じになったら、錨が決まって置き直しが終わったということ
 * (`anchor-snapshot-one-frame-stale` の症状がここに出る)。高さの測り直しは
 * 描画のたびに走るので、1 frame では「測る前」と「測った後」の区別が付かない。
 *
 * 箱がまだ無い画面 (設定・登録) では待つものが無いので、そのまま返る。 */
async function stillness(page: Page): Promise<void> {
  await page.waitForFunction((where: string) => {
    const box = document.querySelector(where);
    if (box === null) return true;
    const was = box.scrollTop;
    return new Promise<boolean>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve(box.scrollTop === was);
        });
      });
    });
  }, BODY);
}

/** Wait for the fonts the page asked for.
 *
 * The rest of "has it stopped moving" is `toHaveScreenshot`'s own: it takes the
 * picture again until two in a row are the same, which is the thing being
 * waited for rather than a guess at how long it takes. */
export async function fontsReady(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}
