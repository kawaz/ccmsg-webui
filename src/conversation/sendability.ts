import { liveness, reachable, type Sid } from "@ccmsg/protocol";
import { peers } from "../state.ts";

/** 送れる相手か、送れないならなぜか。
 *
 * 行から読む (契約の `liveness` / `reachable`)。断られてから知らせるのではなく、
 * 打つ前に言う — 送れない理由はどれも、人が先に手を打てるものになっている。
 *
 * transcript の下の composer と、どこからでも開く方 (FAB) が同じものを読む:
 * 同じセッションに話しかける口が 2 つあって、送れるかの答えが 2 通りあるのは
 * おかしい。 */
export interface Sendability {
  readonly live: boolean;
  readonly why: string;
}

export function sendability(sid: Sid): Sendability {
  const peer = peers.value.find((one) => one.sid === sid);
  if (peer === undefined) {
    return { live: false, why: "このセッションは instance に接続していません" };
  }
  switch (liveness(peer, Date.now())) {
    case "duplicated":
      // 2 つのプロセスが同じ transcript を書いているので、instance は送るのを
      // 断る (契約 DR-0001 §3)。人がやることは run を選ぶこと。
      return { live: false, why: "同じセッションを 2 つのプロセスが書いています" };
    case "paused":
      return { live: false, why: "セッションは終了しています" };
    case "disappeared":
      return { live: false, why: "セッションは居なくなりました" };
    case "alive":
      return reachable(peer)
        ? { live: true, why: "" }
        : { live: false, why: "instance からも端末からも操作できない状態です" };
  }
}
