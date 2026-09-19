/** 一覧と本文の 2 ペインを、出し入れする / 幅を覚える。
 *
 * 幅の覚え方は `split-width.ts` と同じ規律 (instance ごとの名前) に乗せる。
 * 開いているかどうかはこのブラウザの好みなので、instance では分けない — 同じ人が
 * 同じ画面で同じ広さを使う。 */

import { keepOnSignOut } from "../settings.ts";

const OPEN_STORAGE = keepOnSignOut("ccmsg.layout.sessions-open");

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

/** 2 枚が**頁として横に並んでいるか** (= 狭い画面か)。
 *
 * 幅の境目は **CSS が正本**なので、数を持たずに今の姿を読む。読むのは「横へ
 * 送れるか」そのもの — 並べている時の 2 ペインは窓に収まっていて送る所が無く、
 * 頁にしている時だけ窓の外へ続く。`display` の綴りで見分けない: 版組の作りが
 * 変われば綴りも変わるが、送れるかどうかは作りが変わっても同じことを言う。 */
export function pagedSideways(box: HTMLElement): boolean {
  return box.scrollWidth - box.clientWidth > 1;
}
