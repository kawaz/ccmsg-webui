import { lineText } from "../timeline/segment-text.ts";
import type { TimelineGroup } from "../timeline/transcript-model.ts";
import type { SearchUnit } from "./in-view-search.ts";

/** Timeline の中で探せるかたまり = 1 行。
 *
 * 名前は行の byte 位置。読み込み済みの窓が前に伸びても後ろに伸びても同じ行を
 * 指し続けるので、遡っている最中に `[3/12]` の 3 が別の行を指すことがない
 * (fold の名前が同じ値でできているのも同じ理由)。
 *
 * 畳まれている行も入れる。数えるのは「この画面が持っているか」であって
 * 「今描かれているか」ではない。 */
export function timelineSearchUnits(groups: readonly TimelineGroup[]): readonly SearchUnit[] {
  const units: SearchUnit[] = [];
  for (const group of groups) {
    if (group.kind === "entry") {
      units.push({ key: String(group.offset), text: lineText(group.line) });
      continue;
    }
    for (const entry of group.entries) {
      units.push({ key: String(entry.offset), text: lineText(entry.line) });
    }
  }
  return units;
}

/** その行がどのかたまりに居るか。
 *
 * 描くのは group の単位なので、行に辿り着くにはまずその行を含む group を出す
 * ことになる。畳まれた中の行は自分では描かれず、囲む group と同じ所に居る。 */
export function groupIndexByUnitKey(groups: readonly TimelineGroup[]): Map<string, number> {
  const at = new Map<string, number>();
  groups.forEach((group, index) => {
    if (group.kind === "entry") {
      at.set(String(group.offset), index);
      return;
    }
    for (const entry of group.entries) at.set(String(entry.offset), index);
  });
  return at;
}
