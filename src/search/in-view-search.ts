/** いま見えているものの中を探す (DR-0022)。
 *
 * 探す対象は「この画面が今持っているもの」だけ — Timeline の読み込み済みの
 * 範囲と、開いているファイルの本文。instance には何も聞かない。
 *
 * ここは DOM も preact も知らない純粋な層で、クエリの読み取り・一致の列挙・
 * index の巡回だけを持つ。どこを光らせるかは分かるが、光らせるのは描く側。
 *
 * クエリの文法はこの画面のもので、契約にはない。`@ccmsg/protocol` は 2 つの
 * daemon と webui が交わす wire の取り決めであって、人が検索窓に打つ文字列の
 * 読み方はそこに属さない。 */

export interface SearchOptions {
  readonly caseSensitive: boolean;
  readonly regex: boolean;
}

/** 1 ワード。`clause` は「同じ行に書かれた」ことを表し、同じ行のワードは
 * AND で、行どうしは OR で束ねられる。色は行ごとに変える。 */
export interface SearchWord {
  readonly text: string;
  readonly source: string;
  readonly flags: string;
  readonly error: string | undefined;
  readonly clause: number;
  readonly color: number;
}

/** ハイライトの色数。行 (= OR 節) をこの数で巡回させる。 */
export const SEARCH_COLORS = 6;

export interface ParsedSearchQuery {
  readonly words: readonly SearchWord[];
  /** 読めない正規表現が 1 つでもあるか。打っている途中は必ずここを通るので、
   * 読めない行はその行だけ落とし、他の行は使えるままにする。 */
  readonly hasError: boolean;
}

/** 通常検索の 1 行: 空白区切りが AND ワード。ダブルクオートで囲んだ句は
 * 1 ワードで、句の中の連続空白は `\s+` に合わせる (折り返しや整形で空白の
 * 数が変わっても同じ句として見つかるようにするため)。 */
function plainWords(line: string, flags: string, clause: number): SearchWord[] {
  return [...line.matchAll(/("[^"]*"|\S+)/gv)].flatMap((match) => {
    const parts = match[0].replaceAll(/^"|"$/g, "").split(/\s+/v).filter(Boolean);
    if (parts.length === 0) return [];
    return [
      {
        text: parts.join(" "),
        source: parts.map((part) => escapeForRegExp(part)).join("\\s+"),
        flags,
        error: undefined,
        clause,
        color: clause % SEARCH_COLORS,
      },
    ];
  });
}

/** 正規表現の中で「その文字そのもの」を意味させる書き方に直す。
 *
 * `-` を含めないのは、文字クラスの外の `\-` が `v` フラグでは構文誤りになる
 * ため。ここで数える文字は全て ASCII なので、この式自体は `v` を付けない。 */
function escapeForRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** クエリを読む。行内の空白区切りが AND、改行区切りが OR。
 *
 * regex 検索では行を分割せず、1 行をそのまま 1 つの正規表現として読む
 * (空白も式の一部なので trim もしない)。 */
export function parseSearchQuery(query: string, options: SearchOptions): ParsedSearchQuery {
  const flags = `v${options.caseSensitive ? "" : "i"}`;
  const words: SearchWord[] = [];
  let clause = 0;
  for (const line of query.split(/[\r\n]/v)) {
    if (!options.regex) {
      const made = plainWords(line, flags, clause);
      if (made.length === 0) continue;
      words.push(...made);
      clause += 1;
      continue;
    }
    if (line === "") continue;
    let error: string | undefined;
    try {
      new RegExp(line, flags);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
    words.push({
      text: line,
      source: line,
      flags,
      error,
      clause,
      color: clause % SEARCH_COLORS,
    });
    clause += 1;
  }
  return { words, hasError: words.some((word) => word.error !== undefined) };
}

/** 毎回作り直す。使い回すと `lastIndex` が呼ぶ側をまたいで残り、次の
 * `test()` が途中から始まってしまう。 */
function pattern(word: SearchWord, global: boolean): RegExp {
  return new RegExp(word.source, global ? `${word.flags}g` : word.flags);
}

/** この文がクエリを満たすか。1 つでも「その行の全ワードが揃った行」が
 * あれば満たす。読めない行は落とす — 打っている途中の壊れた 1 行で、他の行
 * まで使えなくなるのを避けるため。 */
export function matchesQuery(text: string, words: readonly SearchWord[]): boolean {
  const clauses = new Map<number, SearchWord[]>();
  for (const word of words) {
    if (word.error !== undefined) continue;
    const held = clauses.get(word.clause);
    if (held === undefined) clauses.set(word.clause, [word]);
    else held.push(word);
  }
  if (clauses.size === 0) return false;
  return [...clauses.values()].some((clause) =>
    clause.every((word) => pattern(word, false).test(text)),
  );
}

export interface HighlightRange {
  readonly start: number;
  readonly end: number;
  readonly color: number;
}

/** この文の中の一致を全部並べ、重なりを解いて 1 本の並びにする。
 *
 * ワードどうしは互いに独立した式なので重なりうる (`foo` と `oo`)。入れ子の
 * `<mark>` を作らずに済ませるため、先に始まる方・同じ位置なら長い方を採り、
 * 採ったものの終わりより前から始まるものは飛ばす。 */
export function highlightRanges(text: string, words: readonly SearchWord[]): HighlightRange[] {
  const found: HighlightRange[] = [];
  for (const word of words) {
    if (word.error !== undefined) continue;
    const regexp = pattern(word, true);
    let match: RegExpExecArray | null;
    while ((match = regexp.exec(text)) !== null) {
      if (match[0].length === 0) {
        // 幅ゼロの一致 (regex の `a*` が `b` に当たる類) は同じ位置で
        // 止まり続けるので、1 文字進める。
        regexp.lastIndex += 1;
        continue;
      }
      found.push({ start: match.index, end: match.index + match[0].length, color: word.color });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const kept: HighlightRange[] = [];
  let cursor = 0;
  for (const range of found) {
    if (range.start < cursor) continue;
    kept.push(range);
    cursor = range.end;
  }
  return kept;
}

export interface HighlightPiece {
  readonly text: string;
  /** undefined は光らせない地の文。 */
  readonly color: number | undefined;
}

/** 文を「地の文と光る所」の並びに切る。描く側はこれを text node と `<mark>`
 * に写すだけでよい。一致が無ければ元の文 1 つを返すので、呼ぶ側に「検索して
 * いない時」の分岐が要らない。 */
export function splitForHighlight(
  text: string,
  words: readonly SearchWord[],
): readonly HighlightPiece[] {
  if (words.length === 0) return [{ text, color: undefined }];
  const ranges = highlightRanges(text, words);
  if (ranges.length === 0) return [{ text, color: undefined }];
  const pieces: HighlightPiece[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor)
      pieces.push({ text: text.slice(cursor, range.start), color: undefined });
    pieces.push({ text: text.slice(range.start, range.end), color: range.color });
    cursor = range.end;
  }
  if (cursor < text.length) pieces.push({ text: text.slice(cursor), color: undefined });
  return pieces;
}

/** 既に細切れになっている 1 行 (Shiki が色付けした span の列) に、同じ切り方を
 * 重ねる。
 *
 * 行を繋いだ文で一致を数えてから、その位置を span 側に写す: 一致が span の
 * 境界をまたいでも、色付けの区切りを壊さずに光らせられる。 */
export function splitSpansForHighlight<T>(
  spans: readonly { text: string; style?: T }[],
  words: readonly SearchWord[],
): readonly { text: string; style?: T; color?: number }[] {
  if (words.length === 0) return spans;
  const ranges = highlightRanges(spans.map((span) => span.text).join(""), words);
  if (ranges.length === 0) return spans;
  const out: { text: string; style?: T; color?: number }[] = [];
  let at = 0;
  for (const span of spans) {
    const end = at + span.text.length;
    let cursor = at;
    for (const range of ranges) {
      if (range.end <= at || range.start >= end) continue;
      const from = Math.max(range.start, at);
      const to = Math.min(range.end, end);
      if (from > cursor) out.push({ ...span, text: span.text.slice(cursor - at, from - at) });
      out.push({ ...span, text: span.text.slice(from - at, to - at), color: range.color });
      cursor = to;
    }
    if (cursor < end) out.push({ ...span, text: span.text.slice(cursor - at) });
    at = end;
  }
  return out;
}

/** 次の index。最大を越えたら 1 に戻る。一致が無い時は 0 (= どこも指して
 * いない) を返し、例外にはしない — 呼ぶ側はボタンを無効にしているだけで、
 * 押せてしまっても壊れない方がよい。 */
export function nextIndex(current: number, max: number): number {
  if (max <= 0) return 0;
  return current >= max ? 1 : current + 1;
}

/** 前の index。1 の手前は最大に戻る。 */
export function prevIndex(current: number, max: number): number {
  if (max <= 0) return 0;
  return current <= 1 ? max : current - 1;
}

/** 探せる 1 かたまり。`key` は画面側が同じ名前で登録している目印で、`text` は
 * それが一致するかを決める文。 */
export interface SearchUnit {
  readonly key: string;
  readonly text: string;
}

/** 一致した順に key を並べる。これが `[N/M]` の M で、↑↓ が辿る順。
 *
 * 畳まれているかどうかは見ない — 数えるのは「この画面が持っているか」で
 * あって「今描かれているか」ではない (DR-0022: 隠れた一致にも ↑↓ で辿り
 * 着けて、辿り着く時に囲む fold が開く)。 */
export function matchingKeys(
  units: readonly SearchUnit[],
  words: readonly SearchWord[],
): readonly string[] {
  if (words.length === 0) return [];
  return units.filter((unit) => matchesQuery(unit.text, words)).map((unit) => unit.key);
}
