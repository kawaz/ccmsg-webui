/** 閲覧で使った origin の台帳と、その残骸の掃除 (DR-0005 §2.5、FV-Q15)。
 *
 * 閲覧は開くたびに別の origin を使う (§2.1)。ブラウザはその origin に紐づく物
 * (SW の登録、storage、cookie) を iframe を外しても消さないので、放っておけば
 * 開いた数だけ溜まる。消すのは iframe を置いた側 = webui の責務で、振った id を
 * ここに控え、後で見えない iframe に起動の頁を開いて「片付ける」を送る。
 *
 * 台帳は webui の origin の localStorage。同じブラウザの webui のタブで共有され、
 * 別のブラウザで開いた分はそのブラウザの webui が掃除する — 登録もブラウザごとの
 * 物なので、これで揃う。
 *
 * 消えたことの確認は**主経路** (`sweepViews`) だけがする: 掃除で開いた頁には中身が
 * 居ない (起動の頁は「開く」が来るまで何もしない) ので、送った nonce を返せるのは
 * 起動の頁だけ。閉じる時の副経路 (`cleanViewOrigin` を FileView が呼ぶ) は残骸を
 * 減らす試みで、台帳には触らない — その時点では中身がまだ生きていて、同 origin
 * なので nonce を読める。 */

import { CLEAN, CLEANED, READY } from "../../view/protocol.ts";
import { VIEW_SITE, viewOrigin } from "./view-site.ts";

const PREFIX = "ccmsg.view:";
// 生存印の間隔と、古いと見なす閾値。古さを開いた時刻でなく生存印で測るのは、
// 長く開いたままの閲覧を別のタブの webui が片付けてしまわないため。
const HEARTBEAT_MS = 60_000;
const STALE_MS = 60 * 60_000;
// 定期の掃除。起動時だけでは PWA は何か月も再起動しないことがある。
const SWEEP_MS = 6 * 60 * 60_000;
// 答えが返らなければその回は諦めて id を残し、次の回にまた試す。
const WAIT_MS = 10_000;

function key(id: string): string {
  return `${PREFIX}${id}`;
}

function isStale(storage: Storage, id: string): boolean {
  const recorded = storage.getItem(key(id));
  if (recorded === null) return false;
  const time = Number(recorded);
  return Number.isFinite(time) && Date.now() - time > STALE_MS;
}

/** id を台帳に控える。iframe を置く**前に**呼ぶ — 台帳に無い登録を作らないため。 */
export function markView(id: string): void {
  localStorage.setItem(key(id), String(Date.now()));
}

export function keepViewAlive(id: string): () => void {
  const timer = setInterval(() => markView(id), HEARTBEAT_MS);
  return () => clearInterval(timer);
}

/** 起動の頁に nonce 付きで「片付ける」を送り、同じ nonce の答えが返ったかを言う。
 * 答えの送り手は origin と window の両方で確かめる (FV-Q8)。 */
export function requestClean(frame: HTMLIFrameElement, origin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const nonce = crypto.randomUUID();
    let finished = false;
    const heard = (event: MessageEvent): void => {
      if (event.origin !== origin || event.source !== frame.contentWindow) return;
      const said = event.data as { ccmsg?: string; nonce?: string } | undefined;
      if (said?.ccmsg === CLEANED && said.nonce === nonce) finish(true);
    };
    const finish = (ok: boolean): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      window.removeEventListener("message", heard);
      resolve(ok);
    };
    window.addEventListener("message", heard);
    const timer = setTimeout(() => finish(false), WAIT_MS);
    frame.contentWindow?.postMessage({ ccmsg: CLEAN, nonce }, origin);
  });
}

/** 見えない iframe に起動の頁を開いて片付けさせる。`allow-popups` は付けない —
 * 掃除の頁に別窓を開く理由が無い。 */
export function cleanViewOrigin(
  origin: string,
  shouldClean: () => boolean = () => true,
): Promise<boolean> {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.hidden = true;
    frame.sandbox.add("allow-scripts", "allow-same-origin");
    let finished = false;
    const finish = (cleaned: boolean): void => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      window.removeEventListener("message", heard);
      frame.remove();
      resolve(cleaned);
    };
    const heard = (event: MessageEvent): void => {
      if (
        event.origin !== origin ||
        event.source !== frame.contentWindow ||
        (event.data as { ccmsg?: string } | undefined)?.ccmsg !== READY
      )
        return;
      window.removeEventListener("message", heard);
      if (!shouldClean()) {
        finish(false);
        return;
      }
      void requestClean(frame, origin).then((cleaned) => finish(cleaned));
    };
    window.addEventListener("message", heard);
    const deadline = setTimeout(() => finish(false), WAIT_MS * 2);
    // 開くのは `/view/` のパス: 中身同士が共有できるパスの cookie (`/`、`/view`) が
    // 掃除の頁から見えるように (`view/boot.ts` の expireCookies)。
    frame.src = `${origin}/view/`;
    document.body.append(frame);
  });
}

/** 主経路: 生存印の古い id を片付け、nonce が一致した物だけ台帳から消す。
 * 「片付ける」は何度送っても同じ結果なので、別のタブと同時に同じ id を片付けても
 * 壊れない。 */
export async function sweepViews(site: string, storage: Storage = localStorage): Promise<void> {
  const stale: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const entry = storage.key(i);
    if (!entry?.startsWith(PREFIX)) continue;
    const id = entry.slice(PREFIX.length);
    if (
      /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(id) &&
      isStale(storage, id)
    ) {
      stale.push(id);
    }
  }
  await Promise.all(
    stale.map(async (id) => {
      const cleaned = await cleanViewOrigin(viewOrigin(site, id), () => isStale(storage, id));
      if (cleaned && isStale(storage, id)) storage.removeItem(key(id));
    }),
  );
}

/** 起動時と定期に主経路を回す。閲覧 site が無い配り方では何もしない。 */
export function startViewSweeper(): () => void {
  const site = VIEW_SITE;
  if (site === undefined) return () => {};
  void sweepViews(site);
  const timer = setInterval(() => {
    void sweepViews(site);
  }, SWEEP_MS);
  return () => clearInterval(timer);
}
