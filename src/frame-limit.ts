import { MAX_FRAME_BYTES } from "@ccmsg/protocol";

/** 送る側が守る 1 行の上限 (契約 `MAX_FRAME_BYTES`)。
 *
 * 上限を超えた行は instance が `bad_request` で断り、接続はそのまま続く。
 * 断りには大きさのことしか書かれていないので、送ってから読ませるのではなく
 * 送る前にここで止める。何をするか (分ける / ファイルに書く) は送る人が
 * 決めることなので、契約と同じく上限だけを言って手当ては勧めるに留める。 */

const TEXT_ENCODER = new TextEncoder();

/** これから 1 行として送る JSON の byte 長。改行は数えない — instance は
 * 改行までの中身を測る。 */
export function frameByteLength(frame: unknown): number {
  return TEXT_ENCODER.encode(JSON.stringify(frame)).length;
}

/** 上限を超えているなら、その理由の文。収まっているなら undefined。 */
export function oversizeReason(bytes: number): string | undefined {
  if (bytes <= MAX_FRAME_BYTES) return undefined;
  return `1 度に送れる大きさ (${MAX_FRAME_BYTES.toLocaleString()} バイト) を超えています — ${bytes.toLocaleString()} バイトあります。分けて送るか、ファイルに書いてその場所を送ってください。`;
}
