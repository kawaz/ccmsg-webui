/** 書きかけの本文をどこに置くか。
 *
 * ブラウザは 1 つの店を site 全体で持ち、人はそこから複数の instance に届く。
 * 下書きは 1 つのセッション宛の文章なので、instance と sid の両方で鍵を作る —
 * 裸の名前で置くと、別の instance の同名セッションに宛てた文章が混ざる。 */
export function draftKey(instance: string, sid: string): string {
  return `ccmsg.draft:${instance}:${sid}`;
}
