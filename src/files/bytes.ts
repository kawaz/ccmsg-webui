/** ファイルの中身が線の上で取る形 (契約 `Base64Bytes`)。
 *
 * テキストでも何でも base64 の 1 本で、読みと書きで綴りが同じ (契約 DR-0031
 * §1)。auth の `base64url.ts` とは**別の綴り**で、あちらは padding の無い
 * base64url — 同じ「base64」の語でも表が違うので、片方の関数をもう片方に
 * 使えない。 */

export function decodeBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at += 1) bytes[at] = binary.charCodeAt(at);
  return bytes;
}

/** 範囲ごとに届いたバイト列を、1 つの文として読む。
 *
 * 繋いでから 1 度だけ復号する。UTF-8 の 1 文字は複数バイトで、範囲の境目は
 * 文字の境目を避けてくれない — 範囲ごとに文へ直すと、継ぎ目にある文字が両側で
 * 壊れる。 */
export function textOf(parts: readonly Uint8Array[]): string {
  let size = 0;
  for (const part of parts) size += part.byteLength;
  const whole = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    whole.set(part, at);
    at += part.byteLength;
  }
  return new TextDecoder().decode(whole);
}
