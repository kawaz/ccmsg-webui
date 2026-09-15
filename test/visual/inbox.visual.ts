import { SID } from "./fixture.ts";
import { expect, shot, test } from "./harness.ts";

/** そのセッション宛てに言われて、まだ渡っていない 1 通。
 *
 * 時刻は fixture の最後の item より後 — 待っている 1 通は普通、直前に言った
 * もので、並びの末尾に居る。
 *
 * frame は socket の受け口に足す。この instance のセッションは受け取れる状態に
 * 居るので、本物に積ませるには受け取らない相手を作らねばならず、それは inbox の
 * 絵ではなく「受け取らないセッションの作り方」の絵になる。ここで見たいのは、
 * 待っている 1 通が transcript の並びの中にどう出るか。
 *
 * 足す先を socket にするのは、画面が読むものを 1 つも迂回しないため — 契約の
 * frame として入り、購読の畳みを通り、並びに混ざる所まで本物の道を通る。 */

declare global {
  interface Window {
    /** この test が socket の受け口に frame を 1 つ落とすための入口。 */
    __frame?: (frame: unknown) => void;
    /** instance が名乗った id。mid も frame もこれを持つ。 */
    __instance?: string;
    /** 開いている socket。どれが instance のものかは url だけでは決まらない。 */
    __sockets?: WebSocket[];
    /** inbox の購読に instance が答えたか。差し込むのはその後でなければ
     * ならない (下記)。 */
    __inbox?: true;
  }
}

test("待っている 1 通は、言われた時刻の所に印付きで並ぶ", async ({ usage: page, instance }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    const Original = WebSocket;
    class Watched extends Original {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        // 落とす先は開いている socket ぜんぶ。頁には instance のものの他に
        // 開発 server のものも居て、どちらが後にできるかは決まっていない。
        const opened = (window.__sockets ??= []);
        opened.push(this);
        window.__frame = (frame: unknown) => {
          // frame は行で区切って届く (socket の受け手は改行で切る)。
          const said = `${JSON.stringify(frame)}\n`;
          for (const socket of opened) {
            socket.dispatchEvent(new MessageEvent("message", { data: said }));
          }
        };
        this.addEventListener("message", (event: MessageEvent<string>) => {
          const line = String(event.data);
          if (window.__instance === undefined) {
            const said = /"instance":"([0-9a-f]{32})"/.exec(line);
            if (said !== null) window.__instance = said[1];
          }
          if (line.includes('"topic":"inbox"')) window.__inbox = true;
        });
      }
    }
    (globalThis as { WebSocket: unknown }).WebSocket = Watched;
  });

  await page.goto(`${instance.endpoint}s/${SID}`);
  await expect(page.locator(".tl-window")).toBeVisible();
  await expect(page.locator(".row").first()).toBeVisible();
  // 足すのは購読の答え (instance 自身の空の snapshot) が着いてから。先に足すと
  // その snapshot に置き換えられる — element の topic の snapshot は、その
  // instance の行ぜんぶだから。
  //
  // **着いたことを見てから足す**。行が出ていることを着いた印の代わりにすると、
  // 画面がその後どれだけ instance と話すかで結果が変わる — 話が増えれば inbox の
  // 答えはその分だけ後ろにずれ、差し込んだ行は着いた snapshot に消される。
  await page.waitForFunction(() => window.__inbox === true);
  await page.evaluate((sid: string) => {
    const named = window.__instance as string;
    const say = (data: unknown, snapshot = false) => {
      const frame = { ev: "topic", topic: "inbox", instance: named, data };
      // `snapshot` は「true か、無いか」— false は契約に無い。
      window.__frame?.(snapshot ? { ...frame, snapshot: true } : frame);
    };
    say(
      [
        {
          mid: `${named}/9001`,
          from: "user",
          from_label: "人",
          text: "この畳み方で合っていますか",
          sent_at: 1_772_337_999_000,
          to: sid,
        },
        {
          mid: `${named}/9002`,
          from: "user",
          from_label: "人",
          text: "先に読んでおいてください",
          sent_at: 1_772_338_000_000,
          to: sid,
        },
      ],
      true,
    );
    say([{ mid: `${named}/9002`, removed: true, reason: "expired" }]);
  }, SID);

  // 待っている 1 通と、届かないまま消えた 1 通。消えた方は行ごと残して印を変える。
  await expect(page.locator(".tl-bubble.waiting")).toHaveCount(2);
  await expect(page.locator(".tl-bubble.waiting-waiting")).toHaveCount(1);
  await expect(page.locator(".tl-bubble.waiting-expired")).toHaveCount(1);
  await expect(page.getByText("この畳み方で合っていますか")).toBeVisible();
  await expect(page.getByText("渡らないまま期限が切れました。届いていません。")).toBeVisible();
  await shot(page, "session-inbox-waiting.png");
});
