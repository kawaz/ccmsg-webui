import type { FileKind, Sid } from "@ccmsg/protocol";
import { VIEW_PREFIX } from "../../view/protocol.ts";

/** 閲覧 site の host suffix。空なら閲覧は提供しない (DR-0005 FV-Q7)。 */
export const VIEW_SITE: string | undefined = __VIEW_SITE__ === "" ? undefined : __VIEW_SITE__;

/** id は開くたびに振る。ファイル名やセッションから導出しない (FV-Q14)。 */
export function viewOrigin(site: string, id: string): string {
  const scheme = /^localhost(?::\d+)?$/.test(site) ? "http" : "https";
  return `${scheme}://ccmsg-view-${id}.${site}`;
}

export function newViewId(): string {
  return crypto.randomUUID();
}

/** パスを保つことで、文書内の相対参照も同じ SW に届く (§2.4)。 */
export function viewUrl(origin: string, sid: Sid, kind: FileKind, path: string): string {
  const parts = path.split("/").map(encodeURIComponent).join("/");
  return `${origin}${VIEW_PREFIX}${encodeURIComponent(sid)}/${kind}/${parts}`;
}
