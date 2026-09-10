import { rowText } from "../timeline/item-view.ts";
import type { TimelineNode } from "../timeline/items.ts";
import { nodeRows } from "../timeline/items.ts";
import type { SearchUnit } from "./in-view-search.ts";

/** Timeline の中で探せるかたまり = 1 item (と、その中に畳んだ答え)。
 *
 * 名前は item の id。読み込み済みの範囲が前に伸びても後ろに伸びても同じ item を
 * 指し続けるので、遡っている最中に `[3/12]` の 3 が別の所を指すことがない
 * (fold の名前が同じ値でできているのも同じ理由)。
 *
 * 畳まれている item も入れる。数えるのは「この画面が持っているか」であって
 * 「今描かれているか」ではない。 */
export function timelineSearchUnits(nodes: readonly TimelineNode[]): readonly SearchUnit[] {
  const units: SearchUnit[] = [];
  for (const node of nodes) {
    for (const row of nodeRows(node)) units.push({ key: row.item.id, text: rowText(row) });
  }
  return units;
}

/** その item がどのかたまりに居るか。
 *
 * 描くのは node の単位なので、item に辿り着くにはまずそれを含む node を出す
 * ことになる。畳まれた中の item は自分では描かれず、囲む node と同じ所に居る。 */
export function groupIndexByUnitKey(nodes: readonly TimelineNode[]): Map<string, number> {
  const at = new Map<string, number>();
  nodes.forEach((node, index) => {
    for (const row of nodeRows(node)) at.set(row.item.id, index);
  });
  return at;
}
