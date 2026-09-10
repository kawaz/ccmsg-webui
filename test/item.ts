import type { TranscriptItem } from "@ccmsg/protocol";

/** 型付き item を 1 つ作る。
 *
 * 契約の形をそのまま書くと、どの test も同じ 5 つの共通 field を書き写すことに
 * なるので、そこだけをここが埋める。id は契約どおり `<record>:<何番目>` で、
 * 同じ record から読まれた item は同じ record を指す。 */
let made = 0;

export function item(
  type: string,
  fields: Record<string, unknown> = {},
  where: { uuid?: string; index?: number; offset?: number; bytes?: number } = {},
): TranscriptItem {
  made += 1;
  const uuid = where.uuid ?? `rec-${String(made)}`;
  const index = where.index ?? 0;
  return {
    id: `${uuid}:${String(index)}`,
    uuid,
    type,
    at: `2026-03-01T00:00:${String(made % 60).padStart(2, "0")}.000Z`,
    source: { offset: where.offset ?? made * 100, bytes: where.bytes ?? 80 },
    ...fields,
  } as unknown as TranscriptItem;
}

export function use(type: string, fields: Record<string, unknown> = {}): TranscriptItem {
  return item(type, { role: "use", ...fields });
}

export function result(
  type: string,
  parent: TranscriptItem,
  fields: Record<string, unknown> = {},
): TranscriptItem {
  return item(type, { role: "result", parent_item: parent.id, ...fields });
}
