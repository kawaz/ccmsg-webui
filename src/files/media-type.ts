/** 拡張子から media type を決める表 (DR-0005 §2.3 / FV-Q11)。
 *
 * 決めるのは**親頁**で、instance には聞かない。契約は media type を答えず
 * (契約 DR-0031 §3)、instance の嗅ぎ分けが「閲覧 site で何が script として
 * 走るか」を決める形にもしない — 描画の性質を決める値は、描く責務を持つ側が
 * 持つ。
 *
 * 載せるのは**ブラウザが素で描ける物**だけ。ここに無い拡張子は閲覧に回さない
 * ので、知らない物を `application/octet-stream` で渡して落とす道も無い。 */

const TYPES: ReadonlyMap<string, string> = new Map([
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
  ["avif", "image/avif"],
  ["bmp", "image/bmp"],
  ["ico", "image/x-icon"],
  // SVG は画像だが中に script を書ける。閲覧 site に居る限りそれは閲覧 site の
  // 出自で走るので、webui からは何も届かない (§1.3) — 他の画像と同じ扱いで
  // よいのはそのため。
  ["svg", "image/svg+xml"],
  ["pdf", "application/pdf"],
  ["mp4", "video/mp4"],
  ["webm", "video/webm"],
  ["mov", "video/quicktime"],
  ["mp3", "audio/mpeg"],
  ["wav", "audio/wav"],
  ["ogg", "audio/ogg"],
  ["flac", "audio/flac"],
  ["m4a", "audio/mp4"],
  ["html", "text/html; charset=utf-8"],
  ["htm", "text/html; charset=utf-8"],
  // 描いた HTML が連れてくる物。単独で開く相手ではないが、相対参照で同じ
  // 横取りに来る (§2.4)。
  ["css", "text/css; charset=utf-8"],
  ["js", "text/javascript; charset=utf-8"],
  ["mjs", "text/javascript; charset=utf-8"],
  ["json", "application/json"],
  ["woff", "font/woff"],
  ["woff2", "font/woff2"],
  ["ttf", "font/ttf"],
  ["otf", "font/otf"],
  ["txt", "text/plain; charset=utf-8"],
  ["md", "text/plain; charset=utf-8"],
]);

/** 描く側の分類。何を置いて見せるかは画面が決めるが、そもそも閲覧に回すかを
 * 決めるのはここ。 */
export type ViewableKind = "image" | "pdf" | "video" | "audio" | "html";

const KINDS: ReadonlyMap<string, ViewableKind> = new Map([
  ["image/png", "image"],
  ["image/jpeg", "image"],
  ["image/gif", "image"],
  ["image/webp", "image"],
  ["image/avif", "image"],
  ["image/bmp", "image"],
  ["image/x-icon", "image"],
  ["image/svg+xml", "image"],
  ["application/pdf", "pdf"],
  ["video/mp4", "video"],
  ["video/webm", "video"],
  ["video/quicktime", "video"],
  ["audio/mpeg", "audio"],
  ["audio/wav", "audio"],
  ["audio/ogg", "audio"],
  ["audio/flac", "audio"],
  ["audio/mp4", "audio"],
  ["text/html; charset=utf-8", "html"],
]);

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** このパスを何として渡すか。知らない拡張子は誰にも渡さない。 */
export function mediaTypeFor(path: string): string | undefined {
  return TYPES.get(extensionOf(path));
}

/** このファイルをブラウザに渡して描けるか。渡せるなら、何として。 */
export function viewableKindFor(path: string): ViewableKind | undefined {
  const type = mediaTypeFor(path);
  return type === undefined ? undefined : KINDS.get(type);
}
