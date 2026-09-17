import type { ErrorCode } from "@ccmsg/protocol";
import { Refused } from "./connection.ts";

/** 断られたことを、人が次に何をするかで書く。
 *
 * 契約の `code` で分岐する (`msg` は instance が書いた説明なので、分岐には
 * 使わない)。ここに言葉を持つのは**人の側に次の手がある断り方**だけで、それ
 * 以外は instance の説明をそのまま見せる — 知らない断り方を「予期しない
 * エラー」に丸めると、書いてあることまで消える。 */
const WORDS: Partial<Record<ErrorCode, string>> = {
  session_duplicated:
    "同じセッションを 2 つのプロセスが書いているので、instance は受け取りません。どちらを終わらせるかを選ぶと、また送れるようになります。",
  ambiguous_run:
    "走っている run が 2 つ以上あるので、どれのことかを決められませんでした。run を選び直してください。",
  auth_in_use:
    "今つないでいる instance と、今の接続が使っている passkey は、この画面からは外せません。別の instance を開いてから、または CLI で外してください。",
};

export function describeRefusal(cause: unknown): string {
  if (cause instanceof Refused) return WORDS[cause.code] ?? cause.detail;
  return String(cause);
}
