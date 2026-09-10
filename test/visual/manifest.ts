import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { version } from "../../package.json" with { type: "json" };

/** What this repository keeps of the baseline images.
 *
 * The images themselves are in `kawaz/ccmsg-webui-snapshots`, because their
 * worth is their history — the same screen, version after version — and that
 * history is megabytes of PNG that everybody cloning the source would pay for.
 * What stays here is the digest of each one, which is small, reviewable in a
 * diff, and enough to answer the question this side has to answer: is the
 * checkout being compared against the baseline this version was accepted with?
 *
 * A digest that does not match is not a screen that changed — a screen that
 * changed fails at the comparison itself, with a diff image. It is the
 * baselines being from somewhere else: an unpushed accept, a stale checkout, a
 * file edited outside the accept path. */

const HERE = fileURLToPath(new URL(".", import.meta.url));
const MANIFEST = join(HERE, "manifest.json");

/** Where the baseline images are, kept the same way `playwright.config.ts`
 * says it: the sibling checkout unless a run names another. */
function snapshotsDir(): string {
  return (
    process.env["CCMSG_WEBUI_SNAPSHOTS"] ??
    fileURLToPath(new URL("../../../../ccmsg-webui-snapshots/main", import.meta.url))
  );
}

interface Manifest {
  /** The build whose drawing these images are of. */
  readonly webui_version: string;
  /** Screen name → platform → digest. Per platform because a baseline belongs
   * to the platform that drew it: the same page on a mac and on a CI runner is
   * a different image everywhere there is text. */
  readonly screens: Record<string, Record<string, string>>;
}

function digest(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** Every image in the snapshots checkout, as the manifest spells them. */
function drawn(dir: string): Map<string, Map<string, string>> {
  const screens = new Map<string, Map<string, string>>();
  for (const platform of readdirSync(dir, { withFileTypes: true })) {
    if (!platform.isDirectory() || platform.name.startsWith(".")) continue;
    for (const image of readdirSync(join(dir, platform.name))) {
      if (!image.endsWith(".png")) continue;
      const name = image.slice(0, -".png".length);
      const per = screens.get(name) ?? new Map<string, string>();
      per.set(platform.name, digest(join(dir, platform.name, image)));
      screens.set(name, per);
    }
  }
  return screens;
}

function read(): Manifest {
  return JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest;
}

function write(): void {
  const screens: Record<string, Record<string, string>> = {};
  for (const [name, per] of [...drawn(snapshotsDir())].sort(([a], [b]) => a.localeCompare(b))) {
    screens[name] = Object.fromEntries([...per].sort(([a], [b]) => a.localeCompare(b)));
  }
  const manifest: Manifest = { webui_version: version, screens };
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${MANIFEST} を ${String(Object.keys(screens).length)} 画面で書きました\n`);
}

/** Answer whether the images beside this checkout are the ones it names.
 *
 * Every platform's digest is checked where the file is there, so a checkout
 * carrying both platforms' baselines has both checked from either. A file that
 * is missing is a failure only for the platform this run is on: the other
 * platform's baseline is drawn where that platform is. */
function verify(): number {
  const manifest = read();
  const dir = snapshotsDir();
  const complaints: string[] = [];
  for (const [name, per] of Object.entries(manifest.screens)) {
    for (const [platform, said] of Object.entries(per)) {
      const file = join(dir, platform, `${name}.png`);
      if (!existsSync(file)) {
        if (platform === process.platform) complaints.push(`${platform}/${name}.png がありません`);
        continue;
      }
      const found = digest(file);
      if (found !== said) {
        complaints.push(`${platform}/${name}.png の sha256 が manifest と違います (${found})`);
      }
    }
  }
  for (const [name, per] of drawn(dir)) {
    if (!per.has(process.platform)) continue;
    if (manifest.screens[name] === undefined) complaints.push(`${name} が manifest にありません`);
  }
  if (complaints.length > 0) {
    process.stderr.write(
      `${["基準画像が manifest と合っていません:", ...complaints, "", `基準画像: ${dir}`, "`just visual-accept` で受け入れるか、snapshots リポを取り直してください"].join("\n")}\n`,
    );
    return 1;
  }
  if (manifest.webui_version !== version) {
    process.stdout.write(
      `基準画像は v${manifest.webui_version} のもので、この作業コピーは v${version} です\n`,
    );
  }
  process.stdout.write(`基準画像 ${String(Object.keys(manifest.screens).length)} 画面と一致\n`);
  return 0;
}

const what = process.argv[2];
if (what === "write") write();
else if (what === "verify") process.exit(verify());
else {
  process.stderr.write("使い方: bun test/visual/manifest.ts <verify|write>\n");
  process.exit(2);
}
