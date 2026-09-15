/** inline code に書かれた「ファイルの名前らしき語」の見分け方と、その語に
 * 何を出すか。
 *
 * 書き手はファイルを正しい綴りで書かない。`docs/issue/2026-09-14-foo.md` の
 * ことを `foo` と書き、日付も置き場所も拡張子も落とす。読み手はそれが何を
 * 指すか知っているので、押して開けるなら押したい。
 *
 * 拾う語をどこまで広げるかは、外れた時に何が起きるかで決まる。ここでは
 * **在るものしか出さない** ので、外れは画面に出ない — だから語の形の方は
 * 緩くてよい。緩さの唯一の歯止めがハイフンで、`async` のような、強調のために
 * backtick で囲んだだけの 1 単語を探しに行かないためにある。
 *
 * この file は何にも依らない判定だけを持つ。実際に探すのは instance で、
 * 探した結果からどれを候補にするかは `files/file-word-find.ts`。 */

/** ハイフンを 1 つ以上含み、パスと名前に使う字だけで出来ている語。
 *
 * inline code の中身が丸ごとこれに合う時だけ対象にする — 一部分が合うだけの
 * 文 (`この foo-bar は…`) は、書き手がファイルの名前として書いたものではない。 */
const FILE_WORD_RE = /^[/.\w]+-[/.\w]+(?:-[/.\w]+)*$/;

/** 語そのもの、でなければ何も。 */
export function fileWordOf(value: string): string | undefined {
  return FILE_WORD_RE.test(value) ? value : undefined;
}

/** 1 つの語について instance が答えたもの。
 *
 * `exact` はその綴りのままで在ったファイル。在ったならそれが答えで、候補は
 * 要らない — 書き手は略さずに書いていた。 */
export interface FileWordHits {
  readonly exact?: string;
  /** 日付 prefix・拡張子を補うと名前が合うファイル。近い順。 */
  readonly candidates: readonly string[];
}

/** 語 1 つの見た目。
 *
 * 描く所は hooks と DOM を持つので、何を描くかの判断だけをここに出して、
 * DOM の無い所でも確かめられるようにしてある。 */
export type FileWordView =
  | { kind: "plain" }
  | { kind: "single"; path: string }
  | { kind: "candidates"; paths: readonly string[]; open: boolean };

/** まだ探している間 (`hits` が無い) と、探して何も無かった時は同じ見た目 —
 * どちらも「今この語について言えることは無い」で、待っていることを報せる
 * 印を出すと、結局何も出ない語の方がずっと多い文書が点滅する。 */
export function fileWordView(hits: FileWordHits | undefined, open: boolean): FileWordView {
  if (hits === undefined) return { kind: "plain" };
  if (hits.exact !== undefined) return { kind: "single", path: hits.exact };
  if (hits.candidates.length === 0) return { kind: "plain" };
  return { kind: "candidates", paths: hits.candidates, open };
}
