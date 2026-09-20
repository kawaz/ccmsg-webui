import { useEffect, useRef } from "preact/hooks";
import type { Sid } from "@ccmsg/protocol";
import type { OpenFile } from "../files/files-view.ts";
import { isReadyFrom, ViewPortHost } from "../files/view-port.ts";
import { VIEW_ORIGIN, viewUrl } from "../files/view-site.ts";
import { connection } from "../state.ts";

/** ブラウザが素で描く物を、別の site に描いてもらう窓 (DR-0005 §2.2)。
 *
 * 描くのはこちらではない。置くのは iframe 1 つと、その向こうへ渡すポート 1 本
 * だけで、バイト列は `file.read` から出て `ReadableStream` のまま向こうの
 * Service Worker に着く (§2.3)。
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
 * `allow-top-navigation` は無い。上へ出れば PWA は scope の外になる (§2.2)。 */
const SANDBOX = "allow-scripts allow-same-origin allow-popups";

export function FileView({ sid, file }: { sid: Sid; file: OpenFile }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const origin = VIEW_ORIGIN;
  const { kind, path } = file;

  useEffect(() => {
    if (origin === undefined) return;
    const host = new ViewPortHost(
      (op, args) => connection.request(op, args),
      () => ({ sid, kind, path }),
    );
    const heard = (event: MessageEvent): void => {
      // ポートを渡してよいのは、自分が置いた iframe が閲覧 site の出自から
      // 声を上げた時だけ (FV-Q8)。
      if (!isReadyFrom(event, origin, frame.current?.contentWindow ?? null)) return;
      host.give(event.source as Window, origin);
    };
    window.addEventListener("message", heard);
    return () => {
      window.removeEventListener("message", heard);
      // 窓を閉じればポートの向こうが消える。権限がそれ**そのもの**なので、
      // 閉じることが失効そのものになる (§2.6)。
      host.close();
    };
  }, [origin, sid, kind, path]);

  if (origin === undefined) {
    return (
      <p class="empty">
        バイナリファイルです ({file.size} バイト)。この配り方には閲覧 site がありません。
      </p>
    );
  }
  return (
    <iframe
      class="viewer-frame"
      ref={frame}
      title={`${path} の中身`}
      src={viewUrl(origin, sid, kind, path)}
      sandbox={SANDBOX}
    />
  );
}
