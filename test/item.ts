import type { TranscriptItem } from "@ccmsg/protocol";

/** 型付き item を 1 つ作る。
 *
 * 契約の形をそのまま書くと、どの test も同じ 5 つの共通 field を書き写すことに
 * なるので、そこだけをここが埋める。id は契約どおり `<record>:<何番目>` で、
 * 同じ record から読まれた item は同じ record を指す。主語は既定で `main` —
 * 名指しの要る test だけが `fields` で言う。 */
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
    subject: "main",
    at: 1_772_000_000_000 + made * 1000,
    source: { offset: where.offset ?? made * 100, bytes: where.bytes ?? 80 },
    ...fields,
  } as unknown as TranscriptItem;
}

export function use(type: string, fields: Record<string, unknown> = {}): TranscriptItem {
  return item(type, { role: "use", ...fields });
}

/** 呼び出しへの答え。契約では harness の鍵 (`parent_tool_use_id`) が必ず付き、
 * 読んだ側の id (`parent_item`) は呼び出しを読めていた時だけ付くので、呼び出し
 * を渡さない形も書ける (= その答えは鍵でしか親に辿り着けない)。 */
export function result(
  type: string,
  parent: TranscriptItem | { tool_use_id: string },
  fields: Record<string, unknown> = {},
): TranscriptItem {
  const key = (parent as unknown as Record<string, unknown>)["tool_use_id"];
  return item(type, {
    role: "result",
    ...("id" in parent ? { parent_item: parent.id } : {}),
    ...(typeof key === "string" ? { parent_tool_use_id: key } : {}),
    ...fields,
  });
}
