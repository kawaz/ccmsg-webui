import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

/** Where the baseline images are.
 *
 * Not in this repository. What a baseline is worth is its history — the same
 * screen, version after version — and that history is megabytes of PNG that
 * everyone cloning the source would pay for. So the images live in
 * `kawaz/ccmsg-webui-snapshots` and this repository keeps only their digests
 * (`test/visual/manifest.json`). The sibling checkout is the default, the same
 * way the daemon's source is; CI checks it out under its own path and says so. */
const SNAPSHOTS =
  process.env["CCMSG_WEBUI_SNAPSHOTS"] ??
  fileURLToPath(new URL("../../ccmsg-webui-snapshots/main", import.meta.url));

export default defineConfig({
  testDir: "./test/visual",
  // `*.visual.ts` rather than the usual `*.spec.ts`, because `bun test` claims
  // that name and would try to run these as unit tests. The two runners share
  // one `test/` tree and each has to see only its own.
  testMatch: "**/*.visual.ts",
  // One instance, one daemon, one dev server, on fixed ports: a second worker
  // would be a second daemon asking for the same port, and it would be right to
  // refuse. What is slow here is the browser, not the parallelism.
  workers: 1,
  fullyParallel: false,
  forbidOnly: process.env["CI"] !== undefined,
  reporter: process.env["CI"] === undefined ? [["list"]] : [["list"], ["html", { open: "never" }]],
  // A baseline belongs to the platform that drew it. Fonts, font smoothing and
  // the compositor all differ between a mac and a CI runner, and no threshold
  // hides that: the same page on the two is a different image everywhere there
  // is text. So each platform keeps its own baseline and compares against it —
  // the alternative, one baseline drawn inside a container, buys a single set
  // of images at the price of making `just visual` need docker.
  snapshotPathTemplate: `${SNAPSHOTS}/{platform}/{arg}{ext}`,
  expect: {
    toHaveScreenshot: {
      // Antialiasing moves a handful of pixels between runs of the same
      // browser. What this must not absorb is a layout change, and a shifted
      // element is orders of magnitude more pixels than this.
      maxDiffPixelRatio: 0.002,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium" }],
});
