import { signal } from "@preact/signals";
import { holdSection, type Section } from "../settings-section.ts";
import { actionOf } from "./catalogue.ts";
import {
  type Binding,
  bindingWorks,
  isFailure,
  parseBinding,
  type Platform,
  platformNow,
  resolveBinding,
  resolvedKey,
} from "./binding.ts";

/** キーの表は設定の 1 section (DR-0003 §2.5、DR-0002)。
 *
 * 持つのは **打鍵の綴り → アクション id** の対応だけで、アクションの実体は
 * 知らない (`src/actions/catalogue.ts`)。未知の id が表に残っていても、その行が
 * 効かないだけで済む — 表と定義が互いを知ると、片方を消した時にもう片方が
 * 壊れる。
 *
 * **既定の割り当ては無い。** 人が設定するまで、この画面はどの打鍵も奪わない。 */

/** 1 行。綴りが鍵で、値がその綴りの行き先と、その行の断り方。 */
export interface KeyEntry {
  readonly action: string;
  /** この platform でだけ有効にする。 */
  readonly only?: Platform;
  /** 警告を承知で通す。予約には効かない。 */
  readonly force?: true;
}

export type KeyMap = Readonly<Record<string, KeyEntry>>;

/** その行が今の platform で実際に結ばれる姿。 */
export function bindingOf(spell: string, entry: KeyEntry): Binding | undefined {
  const read = parseBinding(spell);
  if (isFailure(read)) return undefined;
  return {
    ...read,
    ...(entry.only === undefined ? {} : { only: entry.only }),
    ...(entry.force === true ? { force: true as const } : {}),
  };
}

/** 今効いている打鍵。照合の鍵 (platform 解決後) から アクション id へ。
 *
 * `apply` が書き換えるので、設定を触っている間も画面の打鍵はその場で変わる —
 * 覚えるかどうかは別の話 (DR-0002 §2.2)。 */
export const keymap = signal<ReadonlyMap<string, string>>(new Map());

function buildKeymap(value: KeyMap, platform: Platform): ReadonlyMap<string, string> {
  const made = new Map<string, string>();
  for (const [spell, entry] of Object.entries(value)) {
    const binding = bindingOf(spell, entry);
    if (binding === undefined || !bindingWorks(binding, platform)) continue;
    made.set(resolvedKey(resolveBinding(binding, platform)), entry.action);
  }
  return made;
}

function readEntry(held: unknown): KeyEntry | undefined {
  if (typeof held !== "object" || held === null) return undefined;
  const row = held as { action?: unknown; only?: unknown; force?: unknown };
  if (typeof row.action !== "string" || row.action === "") return undefined;
  const only = row.only === "mac" || row.only === "other" ? row.only : undefined;
  return {
    action: row.action,
    ...(only === undefined ? {} : { only }),
    ...(row.force === true ? { force: true as const } : {}),
  };
}

const section: Section<KeyMap> = {
  id: "keys",
  title: "キーバインド",
  empty: {},
  // 名前付きの組は後から配れる形だけ置いておく。今あるのは「何も結ばない」1 つ
  // で、それがこの画面の既定そのもの — 打鍵はブラウザのものから始まる。
  presets: [
    {
      id: "none",
      label: "割り当て無し",
      note: "どの打鍵も奪わない。ブラウザの標準の手がそのまま残る。",
      value: {},
    },
  ],
  parse(held) {
    if (typeof held !== "object" || held === null || Array.isArray(held)) return {};
    const read: Record<string, KeyEntry> = {};
    // 読めない行は**その行だけ**捨てる。1 つ壊れた綴りのために、結んだものを
    // ぜんぶ失わせない。
    for (const [spell, value] of Object.entries(held as Record<string, unknown>)) {
      const entry = readEntry(value);
      if (entry !== undefined) read[spell] = entry;
    }
    return read;
  },
  format(value) {
    return value;
  },
  apply(value) {
    keymap.value = buildKeymap(value, platformNow());
  },
  changed(draft, from) {
    const names = new Set<string>();
    for (const spell of new Set([...Object.keys(draft), ...Object.keys(from)])) {
      const one = draft[spell];
      const other = from[spell];
      // 結んでいないこと自体も 1 つの値として比べる (DR-0002 §2.2)。
      if (one === undefined || other === undefined) {
        names.add(spell);
        continue;
      }
      if (one.action !== other.action || one.only !== other.only || one.force !== other.force) {
        names.add(spell);
      }
    }
    return names;
  },
  revert(draft, from, names) {
    const next: Record<string, KeyEntry> = { ...draft };
    for (const spell of names) {
      const held = from[spell];
      // ベースがその綴りを持っていなければ、消すのが戻すこと。
      if (held === undefined) delete next[spell];
      else next[spell] = held;
    }
    return next;
  },
  adopt(_draft, chosen) {
    // 組が言うのは表ぜんぶ。連れて行く入力がこの section には無い。
    return chosen;
  },
  wordFor(name) {
    return name;
  },
};

export const keys = holdSection(section);

/** 設定の画面が 1 行として並べるもの: アクションと、それに結ばれている綴り。
 *
 * 並ぶのは**アクションの一覧**の方で、綴りの一覧ではない — 人が探すのは
 * 「これを打鍵でやりたい」であって「この打鍵は何だったか」ではない。 */
export function spellsFor(value: KeyMap, action: string): readonly string[] {
  return Object.entries(value)
    .filter(([, entry]) => entry.action === action)
    .map(([spell]) => spell);
}

/** 表に残っているが、今のこの画面にはもう無いアクションを指す行。
 *
 * 消しはしない (設定を別の版で開いただけかもしれない) が、効かないことは言う。 */
export function unknownActions(value: KeyMap): readonly string[] {
  return [...new Set(Object.values(value).map((entry) => entry.action))].filter(
    (id) => actionOf(id) === undefined,
  );
}

/** 綴りを 1 つ結び直す。前の綴りは消える — 同じアクションに 2 つの綴りを結ぶ
 * こともできるが、それは行を足す操作であって、書き換えではない。 */
export function rebind(
  value: KeyMap,
  was: string | undefined,
  spell: string,
  entry: KeyEntry,
): KeyMap {
  const next: Record<string, KeyEntry> = { ...value };
  if (was !== undefined) delete next[was];
  if (spell !== "") next[spell] = entry;
  return next;
}
