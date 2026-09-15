import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** 端末の一覧を、daemon が本物を読む所へ本物の形で置く。
 *
 * daemon は端末管理に `hyoui list --format=jsonl` と訊く。なので作り物にするのは
 * **その 1 行の答えだけ**で、契約の形への読み替えも、pid の突き合わせも、frame の
 * 差分も daemon と契約の実装をそのまま通る。行を webui に差し込む形にすると、
 * 絵が写すのは「この test が書いた行」であって「端末がどう出るか」ではなくなる。
 *
 * 3 つ置く: セッションが動いている端末、人が開いた shell、そして**起動したのに
 * まだ何も名乗っていないハーネス**の端末 (契約 DR-0026 の `starting`)。 */

/** その端末で動いているセッション。端末の話なので transcript は小さくてよい。 */
export const TERMINAL_SID = "33333333-4444-4555-8666-777777777777";

/** 端末の id。handle の綴りは端末管理のもので、`%` を含むものが実物に居る —
 * URL の 1 区切りとして符号化されることが絵にも URL にも出る。 */
export const ATTACHED_TERMINAL = "hyoui:%17";
export const PERSON_TERMINAL = "hyoui:%31";
export const STARTING_TERMINAL = "hyoui:%42";

/** どのプロセスでもない pid。起動中の端末と人の端末はプロセスを持たせない —
 * 突き合わせに要るのは「`agents` に同じ pid が居ないこと」だけで、居ない番号は
 * OS が配る範囲の外から取る方が確かに居ない。 */
const NO_PROCESS = { starting: 999_001, person: 999_002 } as const;

export interface Terminals {
  /** PATH に足す所 (使い捨ての `hyoui` が居る)。 */
  readonly bin: string;
  /** 一覧の中身。daemon が走り出した後で書き換えられる。 */
  readonly listing: string;
}

/** 使い捨ての端末管理を置く。**daemon より先**に置くのは、PATH に入れた所を
 * daemon が起動時に読むから。中身は後から書かれる (走っているプロセスの pid が
 * 要るのは、セッションが動いている 1 行だけ)。 */
export function writeTerminalManager(root: string): Terminals {
  const bin = join(root, "bin");
  const listing = join(root, "terminals.jsonl");
  mkdirSync(bin, { recursive: true });
  writeFileSync(listing, "");
  const stub = join(bin, "hyoui");
  // 一覧しか答えない。他の副命令で呼ばれたらそれは test の側の間違いなので、
  // 黙って空を返さずに落とす。
  writeFileSync(
    stub,
    `#!/bin/sh
case "$1" in
  list) cat ${JSON.stringify(listing)} ;;
  *) echo "この hyoui は list しか答えません: $*" >&2; exit 2 ;;
esac
`,
  );
  chmodSync(stub, 0o755);
  return { bin, listing };
}

export interface TerminalFixture {
  stop(): void;
}

/** 端末の中身を書き、セッションが動いている 1 つには本物の run を用意する。
 *
 * run は状態ファイルで言う (`startDuplicateRuns` と同じ道)。daemon は状態
 * ファイルの `startedAt` を `ps` の言う開始時刻と突き合わせるので、書くのは
 * 本物の時刻でなければならない。 */
export function startTerminals(home: string, listing: string, cwd: string): TerminalFixture {
  const dir = join(home, "sessions");
  mkdirSync(dir, { recursive: true });
  // 待つだけのプロセス。daemon が読むのは「その pid が生きているか」だけ。
  const child: ChildProcess = spawn("sleep", ["3600"], { stdio: "ignore" });
  const pid = child.pid;
  if (pid === undefined) throw new Error("端末の run を立てられませんでした");
  const state = join(dir, `${String(pid)}.json`);
  writeFileSync(
    state,
    `${JSON.stringify({
      sessionId: TERMINAL_SID,
      pid,
      cwd,
      kind: "interactive",
      startedAt: Date.now(),
      name: "端末で動いているセッション",
      status: "working",
    })}\n`,
  );
  // 端末管理の綴り (`session` / `child_state` / `child_pid` / `argv`)。契約の形
  // への読み替えは daemon が持っている。
  const row = (fields: Record<string, unknown>): string =>
    `${JSON.stringify({ status: "running", child_state: "running", cwd, ...fields })}\n`;
  writeFileSync(
    listing,
    [
      row({
        session: handle(ATTACHED_TERMINAL),
        child_pid: pid,
        argv: ["claude", "--continue"],
        started_unix_ms: Date.now() - 600_000,
      }),
      row({
        session: handle(STARTING_TERMINAL),
        child_pid: NO_PROCESS.starting,
        argv: ["claude"],
        started_unix_ms: Date.now() - 4_000,
      }),
      row({
        session: handle(PERSON_TERMINAL),
        child_pid: NO_PROCESS.person,
        argv: ["zsh", "-i"],
        started_unix_ms: Date.now() - 120_000,
      }),
    ].join(""),
  );
  return {
    stop() {
      rmSync(state, { force: true });
      child.kill();
    },
  };
}

function handle(id: string): string {
  return id.slice(id.indexOf(":") + 1);
}

export interface TerminalGateway {
  readonly url: string;
  stop(): Promise<void>;
}

/** 使い捨ての端末 gateway。
 *
 * 本物は端末そのものを描くが、ここが答えるのは**同じ場所に同じ形で立つ静かな
 * 頁**だけ。絵が見るのは「iframe に入るか」と「リンクが端末の画面へ向くか」で、
 * 端末の描画は gateway 自身の repo が持つもの。`frame-ancestors` を立てないのは
 * 本物と同じで、それが埋め込みの成立している条件そのもの。 */
export function startTerminalGateway(port: number): Promise<TerminalGateway> {
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    // 綴りはそのまま出す。handle には `%17` のような綴りが居て、復号すると
    // 制御文字になる — 頁に出すのは「どの端末を出したか」が読めることの方。
    const handle = url.pathname.startsWith("/sessions/")
      ? url.pathname.slice("/sessions/".length)
      : undefined;
    if (handle === undefined || handle === "") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("not found");
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(
      `<!doctype html><meta charset="utf-8"><title>${handle}</title>` +
        `<style>html{background:#11161c;color:#d7dde5;font:13px ui-monospace,monospace}` +
        `body{margin:0;padding:12px}p{margin:0 0 4px}</style>` +
        `<p>$ ccmsg subscribe</p><p>subscribed (${handle})</p><p>$ <span>&#9608;</span></p>`,
    );
  });
  return new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", () => {
      done({
        url: `http://127.0.0.1:${String(port)}`,
        stop: () =>
          new Promise<void>((closed) => {
            server.close(() => {
              closed();
            });
          }),
      });
    });
  });
}
