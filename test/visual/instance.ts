import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { createServer, type ViteDevServer } from "vite";
import { startGateway } from "./gateway.ts";

/** The daemon a screenshot run talks to, and the origin the page is served from.
 *
 * Everything here is disposable and nothing reaches the person's own instance:
 * a config home under the system temp directory, a daemon bound to a port of
 * this run's own, and a dev server standing where a reverse proxy stands in a
 * real deployment.
 *
 * The paths and the ports are **fixed rather than assigned**, which is the
 * whole reason this file names them. What a screenshot compares includes the
 * endpoint on the sign-in screen and the instance id beside a session row, and
 * both are derived from where this host sits: a temp directory with a random
 * suffix would put a different string on screen every run, and no baseline
 * could ever match. Two runs at once collide, and say so — a bound port and a
 * held config home both refuse loudly. */
const ROOT = join(tmpdir(), "ccmsg-webui-visual");
const DAEMON_PORT = 45_871;
const GATEWAY_PORT = 45_873;
/** gateway が posts に提示する合言葉。使い捨ての host のものなので、中身に
 * 意味は無い — 合っていることだけが要る。 */
const WEBHOOK_SOURCE = "llm-gateway";
const WEBHOOK_TOKEN = "visual-gateway-token-0123456789";
/** The instance these screens are of. Fixed for the same reason the paths and
 * the ports are: it is text on the screens being compared. */
const INSTANCE_ID = "00112233445566778899aabbccddeeff";
const PAGE_PORT = 45_872;

export interface Instance {
  /** gateway の文書が刻む基準の時刻。画面に出るのは全てここからの差なので、
   * 撮る側はページの時計もここへ留める。 */
  readonly gatewayBase: number;
  /** gateway が見た要求を 1 件 post する (本物と同じ webhook の道)。 */
  llmEvent(item: Record<string, unknown>): Promise<void>;
  /** Where the page is published — origin plus base, as the build reads it. */
  readonly endpoint: string;
  /** The config home the daemon answers for. */
  readonly home: string;
  /** The state directory this instance keeps its socket under, for a fake
   * session that greets it. */
  readonly stateDir: string;
  /** The working directory a fixture session says it is in. */
  readonly cwd: string;
  /** One registration: the URL that opens the register screen, and the six
   * digits the terminal shows beside it. */
  passkey(): Promise<{ url: string; code: string }>;
  /** One line from a session to whoever is watching, which is what the page
   * raises a toast for. */
  notify(sid: string, text: string): Promise<void>;
  stop(): Promise<void>;
}

/** The ccmsg source a daemon is run from. The sibling checkout by default,
 * because that is where the two repositories sit beside each other; a run that
 * keeps it elsewhere (CI checks it out under its own path) says so. */
function cliPath(): string {
  const named = process.env["CCMSG_CLI"];
  if (named !== undefined && named !== "") return named;
  return fileURLToPath(new URL("../../../../ccmsg/main/src/cli.ts", import.meta.url));
}

/** Wait for the daemon to say it is up, on the log it writes to stderr.
 *
 * The line is what the daemon itself reports, so what is waited for is the
 * event rather than an interval somebody guessed. A process that leaves before
 * saying it ends the wait too — the run would otherwise sit here until the
 * whole suite timed out. */
function started(child: ChildProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const lines = createInterface({ input: child.stderr as NodeJS.ReadableStream });
    const done = (act: () => void) => {
      lines.close();
      act();
    };
    lines.on("line", (line) => {
      try {
        if ((JSON.parse(line) as { message?: unknown }).message === "started") done(resolve);
      } catch {}
    });
    child.once("exit", (code) => {
      done(() => {
        reject(new Error(`daemon が起動せずに終了しました (${String(code)})`));
      });
    });
  });
}

/** Run one CLI command against this host and answer with the JSON it wrote. */
function cli(env: NodeJS.ProcessEnv, args: readonly string[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const run = spawn("bun", [cliPath(), ...args], { env: { ...process.env, ...env } });
    let out = "";
    let err = "";
    run.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
    run.stderr.on("data", (chunk: Buffer) => (err += chunk.toString()));
    run.once("exit", (code) => {
      if (code === 0) resolve(JSON.parse(out) as unknown);
      else reject(new Error(`ccmsg ${args.join(" ")} が失敗しました: ${err}`));
    });
  });
}

export async function startInstance(): Promise<Instance> {
  rmSync(ROOT, { recursive: true, force: true });
  const home = join(ROOT, "home");
  const cwd = join(ROOT, "repo");
  mkdirSync(join(home, "projects"), { recursive: true });
  mkdirSync(cwd, { recursive: true });
  // What makes the directory a config home rather than any directory somebody
  // typed: the CLI refuses to run an instance for one without it.
  writeFileSync(join(home, "settings.json"), "{}\n");

  // The settings as a person writes them: one shared file, the mesh, which
  // instances this host starts, and one file for the instance itself. The id
  // is stated rather than made, because it is on screen — the connection bar
  // names it — and a baseline can only match an instance called the same thing
  // every run.
  const configDir = join(ROOT, "config");
  mkdirSync(join(configDir, "instances"), { recursive: true });
  const settings = (fields: Record<string, unknown>): string =>
    `export default ({ config }: { config: Record<string, unknown> }) => Object.assign(config, ${JSON.stringify(fields)});\n`;
  writeFileSync(join(configDir, "config_v2.ts"), settings({}));
  writeFileSync(join(configDir, "webhook.token"), `${WEBHOOK_TOKEN}\n`);
  writeFileSync(
    join(configDir, `instances/instance-${INSTANCE_ID}.ts`),
    settings({
      name: "visual",
      dir: home,
      entry: { host: "127.0.0.1", port: DAEMON_PORT },
      upstream: {
        // 本物の helper と同じ行を話す使い捨て (`translate-helper.ts`)。翻訳の
        // 経路そのものは daemon の実装をそのまま通る。
        translate_helper: fileURLToPath(new URL("translate-helper.ts", import.meta.url)),
        gateway_url: `http://127.0.0.1:${String(GATEWAY_PORT)}`,
        gateway_webhook_source: WEBHOOK_SOURCE,
        gateway_webhook_token_file: join(configDir, "webhook.token"),
      },
    }),
  );
  writeFileSync(
    join(configDir, "endpoints.json"),
    `${JSON.stringify([{ id: INSTANCE_ID, endpoint: `http://127.0.0.1:${String(DAEMON_PORT)}/` }], null, 2)}\n`,
  );
  writeFileSync(
    join(configDir, "supervisor.json"),
    `${JSON.stringify({ instances: [INSTANCE_ID] }, null, 2)}\n`,
  );

  // The id is the instance's own, read from its state directory and made there
  // the first time it is asked for. Written before the daemon starts, so that
  // it is the one the files above name — and so that every run's baseline says
  // the same thing where the id is on screen.
  const stateDir = join(ROOT, "state");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, "instance.id"), `${INSTANCE_ID}\n`);

  const env: NodeJS.ProcessEnv = {
    HOME: ROOT,
    XDG_CONFIG_HOME: join(ROOT, "xdg-config"),
    XDG_STATE_HOME: join(ROOT, "xdg-state"),
    CCMSG_CONFIG_DIR: configDir,
    CCMSG_STATE_DIR: stateDir,
    CLAUDE_CONFIG_DIR: home,
  };

  // 分単位に丸めた「今」。画面に出るのは全てここからの差なので、基準画像は
  // 走った時刻に依らない。丸めるだけで本物の今から離さないのは、daemon が
  // 出す期限 (access token) と噛み合わせたままにするため。
  const gatewayBase = Math.floor(Date.now() / 60_000) * 60_000;
  const gateway = await startGateway(GATEWAY_PORT, gatewayBase);

  const daemon = spawn("bun", [cliPath(), "daemon", "run", home], {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let vite: ViteDevServer | undefined;
  const stop = async (): Promise<void> => {
    await vite?.close();
    await gateway.stop();
    // By pid, and this run's own child: nothing else on the machine is asked to
    // leave on a visual run's behalf.
    const left = new Promise<void>((resolve) => daemon.once("exit", () => resolve()));
    daemon.kill("SIGTERM");
    await left;
    rmSync(ROOT, { recursive: true, force: true });
  };
  try {
    await started(daemon);
    // The dev server carries what belongs to the instance to the daemon, so the
    // page, the socket and `/auth/*` all answer on one origin — which is what a
    // passkey and a refresh cookie rest on (DR-0001 §2.3). Where it forwards to
    // is read from the environment while the config file loads, so it is said
    // before the server is made.
    process.env["CCMSG_DEV_DAEMON"] = `http://127.0.0.1:${String(DAEMON_PORT)}`;
    vite = await createServer({
      configFile: fileURLToPath(new URL("../../vite.config.ts", import.meta.url)),
      server: { port: PAGE_PORT, strictPort: true },
    });
    await vite.listen();
  } catch (cause) {
    await stop();
    throw cause;
  }

  const llmEvent = async (item: Record<string, unknown>): Promise<void> => {
    const answer = await fetch(
      `http://127.0.0.1:${String(DAEMON_PORT)}/webhook/${WEBHOOK_SOURCE}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${WEBHOOK_TOKEN}`,
        },
        body: JSON.stringify([item]),
      },
    );
    if (!answer.ok) throw new Error(`gateway の webhook が断られました: ${String(answer.status)}`);
  };

  const endpoint = `http://localhost:${String(PAGE_PORT)}/`;
  return {
    endpoint,
    home,
    cwd,
    stateDir,
    gatewayBase,
    llmEvent,
    stop,
    passkey: async () => {
      const said = (await cli(env, [
        "daemon",
        "passkey",
        "add",
        home,
        endpoint,
        "--name",
        "visual",
      ])) as { url?: string; code?: string };
      if (typeof said.url !== "string" || typeof said.code !== "string") {
        throw new Error(`passkey add の答えが読めません: ${JSON.stringify(said)}`);
      }
      return { url: said.url, code: said.code };
    },
    notify: async (sid, text) => {
      await cli(env, ["notify", text, "--sid", sid]);
    },
  };
}
