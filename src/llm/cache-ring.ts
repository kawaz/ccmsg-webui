import { type LlmRequestInfo, llmCacheWindowEndAt } from "@ccmsg/protocol";

/** prompt cache が生きている間だけ回る輪の算術。描くのは `CacheRing.tsx`。
 *
 * 輪は **CSS の animation 1 本**で、負の `animation-delay` で途中から始める。
 * 毎秒の再描画をこの画面が持たないための形で、1 秒ごとに JS が進める作りだと
 * セッションの数だけ毎秒の仕事が増える。ここに残るのは算術だけなので、DOM 無し
 * で試験できる。
 *
 * 一周は **窓まるごと**で、固定の 5 分ではない。gateway は 5 分の cache も 1
 * 時間の cache も張るので、常に 300 秒で切れる輪は、まだ 55 分残っている窓を
 * 「切れた」と言ってしまう。輪が言うのは**残りの割合**で、正確な残り時間は
 * 文字の側の仕事。 */

/** 輪が読む分だけの窓。`LlmRequestInfo` の一部なので frame をそのまま渡せる。 */
export interface CacheWindow {
  readonly received_at: number;
  readonly cache_expires_at?: number;
  readonly origin?: string;
  readonly cache_since_at?: number;
  readonly cache_count?: number;
  readonly next_keepalive_at?: number;
  readonly cache_until_at?: number;
  readonly cache_paused?: boolean;
}

/** cache の 2 つの生のどちらを描いているか。
 *
 * `window` は会話自身が作った最初の cache。`extended` は合図が建て直し続けて
 * いる連なりで、**連なりぜんぶを 1 周**として描く — 見ている人が見ているのは
 * 連なりの予算が減っていくことで、その 1 本 1 本ではない。色を分けるのは、
 * 減っているものが別だから。 */
export type CachePhase = "window" | "extended";

export interface RingSpan {
  readonly phase: CachePhase;
  readonly start: number;
  readonly end: number;
}

/** 今どの範囲を掃いているか。cache が冷えていれば undefined。
 *
 * どちらの相でも「窓がまだ生きていること」が描く条件になる: `cache_until_at`
 * は**これから送る合図の予測**なので、gateway が送るのをやめた時に、その予測が
 * 届いていた何時間ぶんも輪を回し続けてはいけない。 */
export function cacheRingSpan(window: CacheWindow, now: number): RingSpan | undefined {
  const windowEnd = llmCacheWindowEndAt(window);
  if (windowEnd <= now) return undefined;
  const since = window.cache_since_at;
  const until = window.cache_until_at;
  const chained =
    window.cache_paused !== true &&
    (window.cache_count ?? 0) >= 1 &&
    since !== undefined &&
    until !== undefined &&
    until > now &&
    until > since;
  if (chained) return { phase: "extended", start: since as number, end: until as number };
  // 最初の cache が終わるのは、機械が会話から引き継ぐ時か、引き継ぐ予定が
  // 無ければ cache そのものが冷える時。
  const planned = window.cache_paused === true ? undefined : window.next_keepalive_at;
  const end = planned !== undefined && planned > window.received_at ? planned : windowEnd;
  return { phase: "window", start: window.received_at, end };
}

/** 窓の残り (ms)。閉じていれば 0 なので、呼ぶ側は「切れた」と「最初から無い」を
 * 同じ形で扱える。 */
export function cacheRemainingMs(window: CacheWindow, now: number): number {
  return Math.max(0, llmCacheWindowEndAt(window) - now);
}

/** 2 つの animation 名を交互に使う。**名前が変わった時にだけ** animation は
 * 描き直されるので、同じ名前を書き直しても走っている輪は走ったまま — 新しい
 * 要求で輪を頭から回すにはこれが要る。要素ごと作り直す手もあるが、それは打って
 * いる最中の入力欄から focus と caret を奪う。 */
const RING_ANIMATIONS = ["cache-ring-a", "cache-ring-b"] as const;

export interface CacheRingStyle {
  /** 輪を持つ要素の class。 */
  readonly class: string;
  /** 始まりの位置と一周の長さ。 */
  readonly style: Record<string, string>;
}

/** 今の窓の輪、または描くものが無ければ undefined。
 *
 * 呼ぶ側は、窓が変わらない限り結果を**そのまま持ち続ける**こと: 関係の無い
 * 再描画で delay を計算し直すと、走っている animation の時間軸が引き直されて
 * 輪が後ろへ跳ぶ。 */
export function cacheRingStyle(
  window: CacheWindow | undefined,
  now: number,
): CacheRingStyle | undefined {
  if (window === undefined) return undefined;
  const span = cacheRingSpan(window, now);
  if (span === undefined) return undefined;
  const durationSeconds = (span.end - span.start) / 1000;
  if (durationSeconds <= 0) return undefined;
  // 丸めない: gateway の時計がずれて未来の刻印が来たら delay は正になり、輪は
  // 壊れた形で描かれるのではなく、始まるのを待つ。
  const elapsedSeconds = (now - span.start) / 1000;
  // 掃き終わる秒と相で名前を決める。終わりを基準にするのは、合図が届いても
  // 連なりの範囲が変わらない限り名前も変わらず、輪が回り続けるため。
  const step = span.phase === "extended" ? 1 : 0;
  const name = RING_ANIMATIONS[(Math.floor(span.end / 1000) + step) % RING_ANIMATIONS.length];
  return {
    class: `cache-ring ${name as string}${span.phase === "extended" ? " cache-ring-extended" : ""}`,
    style: {
      "--cache-ring-delay": `${String(-elapsedSeconds)}s`,
      "--cache-ring-duration": `${String(durationSeconds)}s`,
    },
  };
}

/** セッションごとに 1 つ、輪を描く窓を選ぶ。
 *
 * frame が運ぶのは「会話の系列ごとの最新の 1 件」なので、1 つのセッションに
 * 複数行 (本人の系列と worker の系列) が居る。輪はセッションの行に 1 つなので、
 * **そのセッション自身の系列** (`main`) を採り、それが無ければ最も遅くまで
 * 生きている窓を採る — 何も選ばないと、worker しか動いていないセッションの
 * 輪が消える。 */
export function sessionCacheWindows(
  rows: readonly LlmRequestInfo[],
): ReadonlyMap<string, LlmRequestInfo> {
  const best = new Map<string, LlmRequestInfo>();
  for (const row of rows) {
    const held = best.get(row.sid);
    if (held === undefined) {
      best.set(row.sid, row);
      continue;
    }
    if (held.main && !row.main) continue;
    if (row.main && !held.main) {
      best.set(row.sid, row);
      continue;
    }
    if (llmCacheWindowEndAt(row) > llmCacheWindowEndAt(held)) best.set(row.sid, row);
  }
  return best;
}
