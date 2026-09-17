import type { Sid } from "@ccmsg/protocol";
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

/** 1 つ動かした先の名前。端では動かない (回り込まない) — 一覧の端で反対側へ
 * 飛ぶと、押しっぱなしで辿っている人が自分がどこに居るか見失う。
 *
 * カーソルがどこにも居ない (= まだ何も触っていない、または居た行が消えた) 時は、
 * 動かす向きの端から始める。 */
export function stepCursor(
  units: readonly ListUnit[],
  from: string | undefined,
  step: 1 | -1,
): string | undefined {
  if (units.length === 0) return undefined;
  const at = units.findIndex((unit) => unitKey(unit) === from);
  if (at < 0) {
    const edge = step === 1 ? units[0] : units[units.length - 1];
    return edge === undefined ? undefined : unitKey(edge);
  }
  const to = units[at + step];
  return to === undefined ? undefined : unitKey(to);
}

/** カーソルが今指しているもの。名前だけ覚えているので、行が消えれば答えも消える
 * — 消えた行のために場所を取っておくと、次の上下がそこから動き出してしまう。 */
export function unitAt(units: readonly ListUnit[], key: string | undefined): ListUnit | undefined {
  return units.find((unit) => unitKey(unit) === key);
}
