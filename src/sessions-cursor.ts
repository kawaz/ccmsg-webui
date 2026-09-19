import type { Sid } from "@ccmsg/protocol";
import { stepKey } from "./cursor.ts";
import type { SessionGroup, SessionSection } from "./sessions.ts";

/** 一覧のカーソルが辿るもの (DR-0003 §2.2)。
 *
 * **セクションとセッションを 1 つの軸で兼ねて辿る**。畳んだセクションが 1 単位に
 * 見えることが人の目に映っている通りだからで、軸を 2 つに分けると、今どちらの軸
 * に居るかを人が覚えていなければならない。
 *
 * ここに画面は出てこない — 何が並んでいるかと、上下がどこへ行くかだけ。 */

export type ListUnit =
  | { readonly at: "section"; readonly section: SessionSection }
  | { readonly at: "session"; readonly section: SessionSection; readonly sid: Sid };

export function unitKey(unit: ListUnit): string {
  return unit.at === "section" ? `section ${unit.section}` : `session ${unit.sid}`;
}

/** 今並んでいるものを、上から順に 1 本の軸へ。**畳んだセクションの中は並ばない**
 * — 目に見えていない行にカーソルが入ると、押した上下が画面のどこも動かさない。 */
export function listUnits(
  groups: readonly SessionGroup[],
  collapsed: ReadonlySet<string>,
): readonly ListUnit[] {
  return groups.flatMap((group) => {
    const head: ListUnit = { at: "section", section: group.section };
    if (collapsed.has(group.section)) return [head];
    return [
      head,
      ...group.rows.map(
        (row) => ({ at: "session", section: group.section, sid: row.sid }) as const,
      ),
    ];
  });
}

/** 1 つ動かした先の名前。動き方は区画に依らないので `src/cursor.ts` が持つ。 */
export function stepCursor(
  units: readonly ListUnit[],
  from: string | undefined,
  step: 1 | -1,
): string | undefined {
  return stepKey(units.map(unitKey), from, step);
}

/** カーソルが今指しているもの。名前だけ覚えているので、行が消えれば答えも消える
 * — 消えた行のために場所を取っておくと、次の上下がそこから動き出してしまう。 */
export function unitAt(units: readonly ListUnit[], key: string | undefined): ListUnit | undefined {
  return units.find((unit) => unitKey(unit) === key);
}
