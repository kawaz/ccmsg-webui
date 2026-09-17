import type { TranscriptItem } from "@ccmsg/protocol";
import { memberOf, voiceOf } from "./item-view.ts";

/** 選択中のメッセージと、同じ声の前後へ動く道 (DR-0003 §2.7)。
 *
 * 「同じ声」は **誰が言ったか (`memberOf`) と、その声の段 (`voiceOf`) の両方が
 * 同じ**もの。片方だけで辿ると、同じ相手の発言でも段が変わった所で列が途切れ
 * たり、別の相手の同じ段の行に飛んだりする。 */

function voiceKey(item: TranscriptItem): string {
  return `${memberOf(item)} ${voiceOf(item)}`;
}

/** 1 つ前 / 後ろの item。端では動かない。 */
export function stepItem(
  items: readonly TranscriptItem[],
  from: string | undefined,
  step: 1 | -1,
): string | undefined {
  if (items.length === 0) return undefined;
  const at = items.findIndex((item) => item.id === from);
  if (at < 0) {
    const edge = step === 1 ? items[0] : items[items.length - 1];
    return edge?.id;
  }
  return items[at + step]?.id;
}

/** 同じ声の前 / 後ろ。選んでいる item が無ければ動かない — 「どの声の列を辿る
 * か」は選んだ 1 通が決めていることなので、選ぶ前のこれは意味を持たない。 */
export function stepInVoice(
  items: readonly TranscriptItem[],
  from: string | undefined,
  step: 1 | -1,
): string | undefined {
  const at = items.findIndex((item) => item.id === from);
  const here = items[at];
  if (at < 0 || here === undefined) return undefined;
  const voice = voiceKey(here);
  for (let to = at + step; to >= 0 && to < items.length; to += step) {
    const item = items[to];
    if (item !== undefined && voiceKey(item) === voice) return item.id;
  }
  return undefined;
}

/** その向きに同じ声が居るか。▲ ▼ の押す所と、アクションの「できるか」が同じ
 * 判定から出る。 */
export function hasVoiceNeighbour(
  items: readonly TranscriptItem[],
  from: string | undefined,
  step: 1 | -1,
): boolean {
  return stepInVoice(items, from, step) !== undefined;
}
