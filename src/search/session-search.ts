import type { SessionSearchArgs } from "@ccmsg/protocol";
import { parseSearchQuery, type SearchWord } from "./in-view-search.ts";

/** セッションを跨いで探す時の、入力 → 契約の引数。画面が無くても試験できるよう
 * に、綴りの決まりごとをここに置く (同じ `search/` に居る in-view search は
 * 「今描かれている物の中を探す」で、こちらは**まだ開いていない transcript** を
 * instance に探させる)。 */

/** 既定の「いつまで遡るか」。5 日は今週の続きを探す幅で、これより広くすると、
 * 一致しない query が config home をまるごと読むことになる (instance は打ち切って
 * `truncated` と言うが、待つのはこちら)。 */
export const DEFAULT_WITHIN = "5d";

const UNITS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/** `5d` / `36h` / `90m` を ms にする。空も読めない綴りも undefined = 窓を置かない
 * — 打ち間違いで**黙って狭い窓**になるより、広く探して遅い方が探し物は見つかる。 */
export function withinMs(text: string): number | undefined {
  const said = /^\s*(\d+)\s*([smhdw])?\s*$/i.exec(text);
  if (said === null) return undefined;
  const amount = Number(said[1]);
  if (amount <= 0) return undefined;
  const unit = UNITS[(said[2] ?? "d").toLowerCase()];
  return unit === undefined ? undefined : amount * unit;
}

export interface SearchForm {
  readonly query: string;
  readonly user: boolean;
  readonly agent: boolean;
  readonly cwd: string;
  readonly sid: string;
  readonly within: string;
  readonly regex: boolean;
  readonly caseSensitive: boolean;
}

export const EMPTY_FORM: SearchForm = {
  query: "",
  user: true,
  agent: true,
  cwd: "",
  sid: "",
  within: DEFAULT_WITHIN,
  regex: false,
  caseSensitive: false,
};

/** 空欄は**送らない**。契約は書かれていない項目を「絞らない」と読むので、空文字
 * を送るのは「空文字に一致するものを探せ」と言うことになる。 */
export function searchArgs(form: SearchForm): SessionSearchArgs {
  const query = form.query.trim();
  const cwd = form.cwd.trim();
  const sid = form.sid.trim();
  const within = withinMs(form.within);
  return {
    ...(query === "" ? {} : { query }),
    ...(cwd === "" ? {} : { cwd }),
    ...(sid === "" ? {} : { sid }),
    ...(within === undefined ? {} : { modified_within_ms: within }),
    ...(form.regex ? { regex: true } : {}),
    ...(form.caseSensitive ? { case_sensitive: true } : {}),
    // 既定はどちらも true なので、落とす時だけ言う。
    ...(form.user ? {} : { target_user: false }),
    ...(form.agent ? {} : { target_agent: false }),
  };
}

/** 探す相手が 1 つも無い入力。押しても instance が config home を端から読むだけ
 * なので、押す前に止める。 */
export function isBlank(form: SearchForm): boolean {
  return form.query.trim() === "" && form.cwd.trim() === "" && form.sid.trim() === "";
}

/** transcript の file の大きさ。桁が分かれば足りる。 */
export function sizeWords(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

/** 一致した所を光らせるための語。
 *
 * 画面の中を探す側と**同じ parser** を通す (`parseSearchQuery`): 同じ 1 行を
 * 打って、instance が探す語と画面が光らせる語が違っていたら、出ている行の
 * どこが当たったのか読めなくなる。regex はそのまま渡る (打たれた行が
 * パターンそのもの)。 */
export function highlightWords(form: SearchForm): readonly SearchWord[] {
  return parseSearchQuery(form.query, {
    regex: form.regex,
    caseSensitive: form.caseSensitive,
  }).words;
}
