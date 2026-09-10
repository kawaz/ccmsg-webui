import { expect, test as base, type Page } from "@playwright/test";
import { OTHER_SID, SID, writeFixture } from "./fixture.ts";
import { type Instance, startInstance } from "./instance.ts";
import { type FakeSession, greetAsSession } from "./session.ts";

/** What every visual test runs against: one disposable instance with a fixture
 * transcript and two sessions greeting it, and one browser that registers a
 * passkey against it and keeps it.
 *
 * Both are worker-scoped, and that is not only about cost. Who this browser is
 * is held in two places a fresh context would drop — the credential inside the
 * virtual authenticator, and the refresh cookie the daemon set — so a
 * registration made for one screenshot has to be the same browser every screen
 * after it is drawn in. */
export interface Fixtures {
  instance: Instance;
  ui: Page;
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
            transcriptPath: fixture.transcriptPath,
            title: "基準画像の置き場を決める",
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
    async ({ browser }, use) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      // The virtual authenticator is the browser's own, driven over CDP: what
      // the page calls is `navigator.credentials`, and every byte it produces
      // goes through the daemon's real verification. Nothing about the
      // registration is stubbed — only the finger.
      const cdp = await context.newCDPSession(page);
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
      await use(page);
      await context.close();
    },
    { scope: "worker" },
  ],
});

export { expect };

/** Take one screenshot, with what the page cannot draw the same way twice
 * covered over.
 *
 * Both places are in the connection bar, and neither is about a screen:
 *
 * - `.meta` carries who this browser is and **how long its access lasts**, and
 *   the second half of that counts down
 * - `.footer` names the **daemon's version**, which belongs to another
 *   repository's release cadence — left uncovered, every ccmsg release would
 *   redraw all of these baselines while nothing about the page had changed
 *
 * A mask keeps the element's own box, so the bar moving or changing size still
 * fails; what is given up is the text inside those few hundred pixels.
 *
 * Everything else on screen is deterministic by construction rather than by
 * being hidden: the instance id is seeded, the transcript is a fixture with
 * fixed instants, and the endpoint is this run's fixed port. */
export async function shot(page: Page, name: string): Promise<void> {
  await fontsReady(page);
  await expect(page).toHaveScreenshot(name, {
    mask: [page.locator(".bar .meta"), page.locator(".bar .footer")],
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
