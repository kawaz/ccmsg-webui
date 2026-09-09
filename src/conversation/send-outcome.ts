import type { MessageSendResult, UndeliveredReason } from "@ccmsg/protocol";

/** 送った結果を、送った人が次に何をするかで書く。
 *
 * `delivered: false` は失敗ではない — 契約では inbox に積まれた、という成功で、
 * 待つのか / 別のセッションに送り直すのか / 諦めるのかだけが違う。文言はその
 * 3 つの分かれ目を言い、内部の語 (op 名や理由の綴り) は出さない。 */

const REASONS: Readonly<Record<UndeliveredReason, string>> = {
  preparing: "まだ受け取れる状態ではないので inbox に積みました。動き出したら届きます。",
  paused: "セッションは止まっています。inbox に積んだので、戻ってきたら届きます。",
  disappeared: "セッションはもう居ません。inbox には残るので、戻ってくれば届きます。",
  instance_unreachable: "セッションを持つ instance に届きません。inbox に積みました。",
  throttled: "セッションが今は受け取れないので inbox に積みました。待てば届きます。",
  inbox_full: "inbox が一杯だったので、いちばん古い 1 通を落として積みました。",
};

/** 渡っていない理由だけを言う。一覧に並べる 1 行はこちらを使う (送った直後の
 * 文と違い、代わりの送り先は既に選び終わっているため)。 */
export function describeUndelivered(reason: UndeliveredReason | undefined): string {
  return reason === undefined ? "inbox に積みました。" : REASONS[reason];
}

export function describeSendOutcome(result: MessageSendResult): string {
  if (result.delivered) return "届きました。";
  const head = describeUndelivered(result.reason);
  const candidates = result.candidates ?? [];
  if (candidates.length === 0) return head;
  const names = candidates.map((one) => one.ws ?? one.sid).join(" / ");
  return `${head} 同じリポジトリで動いているセッション: ${names}`;
}
