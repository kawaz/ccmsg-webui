import { holdSection, type Section } from "./settings-section.ts";

/** 「切断時にローカルの設定を残す」(DR-0004 §2.6、**既定 off**)。
 *
 * 切断は「この端末から降りる」なので、既定は跡を残さない — `ccmsg.` の
 * 付くこの origin の名前を、好みも含めて 1 つ残らず消す。好みを失うことが
 * 取り返しのつかない損失なのは、設定がまだこの端末にしか無い今だけで、ユーザの
 * record としてサーバに載れば入り直した時に戻ってくる (契約 DR-0030 §6)。
 *
 * それでも残したい人は居るので設定にはするが、既定を「残す」にすると、端末を
 * 手放す人が明示的に外す操作を要求されることになる。
 *
 * 残るのは**人の好みの名前だけ**で、それを名乗るのは名前を作る所
 * (`keepOnSignOut`)。認証・接続・セッションに属する名前はこの設定でも残らない。 */

export interface SignOutKeep {
  /** 残すか。覚えていないこと自体が「残さない」。 */
  readonly keep?: boolean;
}

const EMPTY: SignOutKeep = {};
const NAME = "keep";

/** この section は入力が 1 つしかないので、組を持たない — 名前の付いた組は
 * 「複数の入力をまとめて動かす」ためのもので、入力 1 つに組を用意すると、
 * 入力そのものと同じことを 2 通りの押し方で言うことになる。 */
export const signOutSection: Section<SignOutKeep> = {
  id: "signout",
  title: "切断",
  empty: EMPTY,
  presets: [],
  parse(held) {
    if (typeof held !== "object" || held === null || Array.isArray(held)) return EMPTY;
    const keep = (held as { keep?: unknown }).keep;
    return typeof keep === "boolean" ? { keep } : EMPTY;
  },
  format: (value) => value,
  // 画面に効く所を持たない — 効くのはログアウトを押した時だけで、それは
  // 「今の画面がどう見えるか」ではない。
  apply() {},
  wordFor: () => "切断時にローカルの設定を残す",
  changed(draft, from) {
    return (draft.keep ?? false) === (from.keep ?? false) ? new Set() : new Set([NAME]);
  },
  revert(draft, from, names) {
    if (!names.includes(NAME)) return draft;
    return from.keep === undefined ? {} : { keep: from.keep };
  },
  adopt: (_draft, chosen) => chosen,
};

export const signOutKeep = holdSection(signOutSection);

/** 切断で人の好みを残すか。今覚えてある値が答える — 試している最中の
 * 下書きは、保存していない限り切断には効かない。 */
export function keepsPreferences(): boolean {
  return signOutKeep.saved.peek().keep ?? false;
}

export const KEEP_NAME = NAME;
