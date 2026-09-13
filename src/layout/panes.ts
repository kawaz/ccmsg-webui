/** 一覧と本文の 2 ペインを、出し入れする / 幅を覚える。
 *
 * 幅の覚え方は `split-width.ts` と同じ規律 (instance ごとの名前) に乗せる。
 * 開いているかどうかはこのブラウザの好みなので、instance では分けない — 同じ人が
 * 同じ画面で同じ広さを使う。 */

const OPEN_STORAGE = "ccmsg.layout.sessions-open";

/** 一覧の幅を覚える鍵。`split-width.ts` と同じ規律で instance ごとに分ける —
 * 1 つのブラウザが複数の instance に届き、広さの好みは相手ごとに違う。 */
export function sessionsSplitKey(instance: string): string {
  return `ccmsg.layout.sessions-split:${instance}`;
}

export function sessionsOpenKey(): string {
  return OPEN_STORAGE;
}

/** 覚えていた開閉。読めない値は「覚えていない」= 既定 (開いている) と同じ。
 * 開いている方を既定にするのは、一覧が入口だから。 */
export function parseSessionsOpen(raw: string | undefined): boolean {
  return raw !== "closed";
}

export function formatSessionsOpen(open: boolean): string {
  return open ? "open" : "closed";
}
