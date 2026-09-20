import type { FileKind, Sid } from "@ccmsg/protocol";
import { VIEW_PREFIX } from "../../view/protocol.ts";

/** 閲覧 site がどこに居るか (DR-0005 FV-Q7)。
 *
 * **ビルド時の定数**。webui を build するのも閲覧 site を配るのも hosting で、
 * 同じ場所で決まる値を 2 か所に持たない。自分で立てる人も build は必ず通る。
 *
 * 既定は**無し**。閲覧 site を立てていない配り方でも webui はそのまま動き、
 * ブラウザに渡すはずだったファイルは「バイナリファイルです」のまま残る。 */
export const VIEW_ORIGIN: string | undefined = __VIEW_ORIGIN__ === "" ? undefined : __VIEW_ORIGIN__;

/** 1 つのファイルの閲覧 URL。
 *
 * `/view/<sid>/<kind>/<path>` という**パスの形をそのまま保つ**のが効き目の
 * 中心で、描いた HTML の相対参照が同じ横取りに落ちるのはこの形のため
 * (§2.4)。 */
export function viewUrl(origin: string, sid: Sid, kind: FileKind, path: string): string {
  const parts = path.split("/").map(encodeURIComponent).join("/");
  return `${origin}${VIEW_PREFIX}${encodeURIComponent(sid)}/${kind}/${parts}`;
}
