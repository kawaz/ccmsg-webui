import { type ReadonlySignal, signal } from "@preact/signals";
import { BASE } from "./base.ts";

/** webui 自身の Service Worker (`src/sw.ts`) を登録する所と、それが効いているかを
 * 言う所。
 *
 * SW が navigation の応答に COOP を足しているかどうかは、閲覧の機能を出してよいか
 * を決める (DR-0005 §5): 足されていなければ、閲覧 iframe の中身が webui の URL を
 * 別窓で開くだけで PWA の画面が乗っ取られる。登録できない環境 (secure context で
 * ない、private browsing の一部) では黙って引き下がり、この印が立たないまま残る。 */

const active = signal(false);

/** この頁の scope への navigation が SW を通るようになったか。
 *
 * 見ているのは「この頁が制御されているか」(`controller`) ではなく「scope に動いて
 * いる SW が居るか」(`ready`)。守りたいのは**これから開かれる**文書 — 閲覧の中身が
 * 開く別窓 — で、それを受けるのは scope の SW であって今の頁の制御者ではない。
 * 強制再読み込みした頁は制御されないが、その頁から開く別窓は SW を通る。 */
export const serviceWorkerActive: ReadonlySignal<boolean> = active;

/** SW を登録する。起動時に 1 度呼ぶ。
 *
 * script は build の根 (`<base>sw.js`) に置かれ、scope は base そのもの — prefix を
 * 付けて配った build でも、その build が答える範囲だけを受け持つ。 */
export function registerServiceWorker(): void {
  // secure context でなければ API そのものが無い。
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register(`${BASE}sw.js`, { scope: BASE }).catch(() => {
    // 登録を断られた環境では閲覧の機能を出さないだけで、他は SW 無しで全部動く。
    // 人に言うことは無い — 言われても直せる所が無い。
  });
  void navigator.serviceWorker.ready.then(() => {
    active.value = true;
  });
}
