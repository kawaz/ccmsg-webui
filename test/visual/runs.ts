import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** 同じセッションを 2 つのプロセスが書いている状態を、本物の道で作る。
 *
 * ハーネスが走っているセッションを resume すると、状態ファイルが 2 つ、同じ
 * `sessionId` を名乗って並ぶ (契約 DR-0001)。daemon はその 2 つを **pid で**
 * 読むので、ここでやることも同じ: 生きているプロセスを 2 つ用意し、その pid の
 * 状態ファイルを config home に置く。行を作り物で差し込むのではなく、daemon が
 * 実際に読む所へ本物の入力を置くので、畳み方も凍結も daemon の実装をそのまま
 * 通る。
 *
 * プロセスは**待つだけのもの**で、ハーネスではない。daemon がここから読むのは
 * 「その pid が生きているか」だけで、中身は問われない。 */
export interface DuplicateRuns {
  stop(): void;
}

/** 状態ファイルが 1 つ書かれるたびに増える名前。ハーネスは `<pid>.json` で
 * 書くので、こちらもそう書く。 */
function stateFile(dir: string, pid: number): string {
  return join(dir, `${String(pid)}.json`);
}

export function startDuplicateRuns(home: string, sid: string, cwd: string): DuplicateRuns {
  const dir = join(home, "sessions");
  mkdirSync(dir, { recursive: true });
  const children: ChildProcess[] = [];
  const files: string[] = [];
  for (const _unused of [0, 1]) {
    // 待つだけのプロセス。終わらせるのはこの fixture で、test ではない。
    const child = spawn("sleep", ["3600"], { stdio: "ignore" });
    // 起動時刻は**本物**を書く。daemon は状態ファイルの `startedAt` を `ps` が
    // 言う開始時刻と突き合わせ、離れていれば「OS が同じ番号を別のプロセスに
    // 配った」と読んで行を落とす (契約、`SessionRun` の `started_at`)。書き下した
    // 時刻を入れると、行は一度出てから消える。
    const startedAt = Date.now();
    children.push(child);
    const pid = child.pid;
    if (pid === undefined) throw new Error("run を立てられませんでした");
    const path = stateFile(dir, pid);
    files.push(path);
    writeFileSync(
      path,
      `${JSON.stringify({
        sessionId: sid,
        pid,
        cwd,
        kind: "interactive",
        startedAt,
        name: "二重に走っているセッション",
        status: "working",
      })}\n`,
    );
  }
  return {
    stop() {
      for (const path of files) rmSync(path, { force: true });
      for (const child of children) child.kill();
    },
  };
}
