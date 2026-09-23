import { useEffect, useRef } from "preact/hooks";
import type { Sid } from "@ccmsg/protocol";
import type { OpenFile } from "../files/files-view.ts";
import { cleanViewOrigin, keepViewAlive, markView } from "../files/view-ledger.ts";
import { isReadyFrom, ViewPortHost } from "../files/view-port.ts";
import { newViewId, VIEW_SITE, viewOrigin, viewUrl } from "../files/view-site.ts";
import { serviceWorkerActive } from "../service-worker.ts";
import { connection } from "../state.ts";

/** ブラウザが素で描く物を、別の site に描いてもらう窓 (DR-0005 §2.2)。
 *
 * 描くのはこちらではない。置くのは iframe 1 つと、その向こうへ渡すポート 1 本
 * だけで、バイト列は `file.read` から出て `ReadableStream` のまま向こうの
 * Service Worker に着く (§2.3)。
 *
 * origin は**開くたびに乱数の id で変える** (§2.1、FV-Q14)。描いたファイル同士の
 * 壁は origin で、同じファイルを開き直しても前の origin には戻らない。振った id は
 * 台帳に控え、閉じた後の残骸 (SW の登録、storage、cookie) は台帳から掃除する
 * (§2.5、FV-Q15)。
 *
 * 別タブ / 別窓では開けない (FV-Q13)。閲覧 site は定義上 webui と site が違う
 * ので、トップレベルで開いた瞬間に PWA は scope の外へ出て戻れなくなる。 */

/** iframe に許す物 (§6 の裁定)。
 *
 * - `allow-scripts` — 描いた docs や図が動く形で見えるため
 * - `allow-same-origin` — 閲覧 site 自身の出自を保つため。Service Worker が
 *   答えを返せるのはこれがある時だけで、出自は**閲覧 site の物**なので webui
 *   には何も届かない (§1.3)
 * - `allow-popups` — 中の外部リンクが開けるため。`allow-popups-to-escape-sandbox`
 *   は**付けない**ので、開いた窓もこの箱を継ぐ
 *
 * `allow-top-navigation` は無い。上へ出れば PWA は scope の外になる (§2.2)。
 * 中身が webui の URL を別窓で指す経路は、webui 自身の SW が頁に付ける COOP が
 * 塞ぐ (§2.2、`src/sw.ts`)。 */
const SANDBOX = "allow-scripts allow-same-origin allow-popups";

export function FileView({ sid, file }: { sid: Sid; file: OpenFile }) {
  const mount = useRef<HTMLDivElement>(null);
  const { kind, path } = file;
  // 閲覧を出すのは、webui 自身の SW が頁に COOP を付けている時だけ (DR-0005 §5)。
  // 付いていなければ、中身が webui の URL を別窓で指すだけで PWA の画面が乗っ取られる。
  const guarded = serviceWorkerActive.value;

  useEffect(() => {
    if (VIEW_SITE === undefined || !guarded || mount.current === null) return;
    const id = newViewId();
    const origin = viewOrigin(VIEW_SITE, id);
    const host = new ViewPortHost(
      (op, args) => connection.request(op, args),
      () => ({ sid, kind, path }),
    );
    // iframe は JSX でなく手で作る: src と sandbox を id を振った後に決め、置く前に
    // 台帳へ控える順番 (§2.5、控えるのが先) を、描画の都合に左右されないため。
    const frame = document.createElement("iframe");
    frame.className = "viewer-frame";
    frame.title = `${path} の中身`;
    frame.setAttribute("sandbox", SANDBOX);
    frame.src = viewUrl(origin, sid, kind, path);
    const heard = (event: MessageEvent): void => {
      // ポートを渡してよいのは、自分が置いた iframe が閲覧 site の出自から
      // 声を上げた時だけ (FV-Q8)。
      if (!isReadyFrom(event, origin, frame.contentWindow)) return;
      host.give(event.source as Window, origin);
    };
    window.addEventListener("message", heard);
    markView(id);
    const stopHeartbeat = keepViewAlive(id);
    mount.current.append(frame);
    return () => {
      stopHeartbeat();
      window.removeEventListener("message", heard);
      // 窓を閉じればポートの向こうが消える。権限がそれ**そのもの**なので、
      // 閉じることが失効そのものになる (§2.6)。
      host.close();
      frame.remove();
      // 残骸はその場で片付けを試みる (副経路)。掃除用の頁を別に開くのは、この
      // iframe を DOM の中で動かすと読み込み直しが起きるから。台帳には触らない —
      // 消えたことの確認は主経路 (`startViewSweeper`) が後でやる (§2.5)。
      void cleanViewOrigin(origin);
    };
  }, [sid, kind, path, guarded]);

  if (VIEW_SITE === undefined) {
    return (
      <p class="empty">
        バイナリファイルです ({file.size} バイト)。この配り方には閲覧 site がありません。
      </p>
    );
  }
  if (!guarded) {
    return (
      <p class="empty">
        バイナリファイルです ({file.size} バイト)。この環境では Service Worker
        が使えないため、閲覧できません。
      </p>
    );
  }
  return <div ref={mount} />;
}
