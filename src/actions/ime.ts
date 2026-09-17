/** 変換中の打鍵をアクションに流さない (DR-0003 §2.5)。
 *
 * 事故はいつも同じ 2 つ — **変換確定の Enter で送られる**、**変換を取り消す
 * Escape で後ろの何かが閉じる**。どちらも「打ったつもりのない打鍵」で、人は
 * 文字を確定しただけ。
 *
 * 判定を打鍵の**入口 1 か所**に置くのは、composer だけの話ではないから。入力欄
 * の中で閉じる操作 (`composer-keydown.ts`) が自分で見ても、区画の役や人が結んだ
 * 打鍵はその外を通るので、同じ判断を 2 度書くことになる。
 *
 * DOM を知らない形にしてあるので、変換中のイベントは組み立てて確かめられる —
 * `page.keyboard` では IME を再現できない。 */

/** 判定に要るのはこれだけ。`KeyboardEvent` をそのまま渡せる。 */
export interface KeyLike {
  readonly code: string;
  /** 変換中か。仕様どおりに立つブラウザではこれで足りる。 */
  readonly isComposing: boolean;
  /** 変換中の打鍵が 229 で来る古い経路。`isComposing` を立てない場面が残って
   * いるので、両方を見る。 */
  readonly keyCode: number;
}

/** 確定を終えた直後に来る打鍵。 */
const SETTLING = new Set(["Enter", "NumpadEnter", "Escape"]);

/** 打鍵を受けてよいかを答える門。
 *
 * `composed()` を `compositionend` で呼び、`accepts()` を keydown で呼ぶ。 */
export interface KeyGate {
  composed(): void;
  accepts(event: KeyLike): boolean;
}

export function keyGate(): KeyGate {
  /** 変換が終わった直後か。**次の打鍵 1 回で消える**。 */
  let settling = false;
  /** 直前に答えた打鍵と、その答え。
   *
   * **同じ打鍵を 2 人が訊く**: 入力欄の中で閉じる操作 (composer の送る) が
   * target で訊き、区画の役と人が結んだ打鍵が window で訊く。1 回目で印を
   * 消してしまうと、2 人目には確定の打鍵が本物の Enter に見える。 */
  let answered: KeyLike | undefined;
  let answer = true;
  return {
    composed() {
      settling = true;
    },
    accepts(event) {
      if (answered === event) return answer;
      answered = event;
      // 消すのは最初に見た打鍵で、受けるかどうかより先。ここを後回しにすると、
      // 入力欄の中で捨てた打鍵の分だけ印が残り、関係の無い打鍵に当たる。
      const justSettled = settling;
      settling = false;
      // Safari は変換確定の Enter を `compositionend` の**後**に
      // `isComposing: false` で配る。仕様どおりに読むと確定の打鍵が本物の
      // Enter に見えるので、直後の 1 回だけ確定の側に数える。
      answer =
        !event.isComposing && event.keyCode !== 229 && !(justSettled && SETTLING.has(event.code));
      return answer;
    },
  };
}

/** 画面ぜんぶで 1 つの門。
 *
 * 入口が 2 つある (window の打鍵と、入力欄の中で閉じる操作) のに、変換が終わった
 * ことは 1 つの出来事なので、印も 1 つにする。 */
export const composing = keyGate();
