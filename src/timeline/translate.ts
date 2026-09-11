/** 本文を日本語で読むための層。訳すのは item の文 (会話と思考) だけで、道具の
 * 引数も code も触らない — 訳して意味が変わらないのは散文だけ。
 *
 * **段落 (`\n\n`) ごと**に訳して段落ごとに繋ぎ直す。markdown の構造 (箇条書き・
 * 見出し) は段落の境で決まるので、境を保てば訳しても構造は崩れない。訳は段落
 * 単位で覚えるので、同じ段落は item をまたいで 1 度しか訳さない。
 *
 * 訳せなかった段落は**原文のまま**残す。1 段落の失敗で本文ぜんぶが読めなく
 * なる方が、その段落だけ英語で残るより悪い。 */

/** 本文を、訳せる塊と**触ってはいけない塊**に分ける。
 *
 * 区切りは段落 (`\n\n`) だが、囲みコード (``` / ~~~) はその中に空行があっても
 * 1 つの塊として扱い、訳しに回さない。コードを訳せば識別子が別のものを指し、
 * 行の並びも失われる — 訳して意味が変わらないのは散文だけ。
 *
 * 塊は**後ろの区切りごと**持つので、繋ぎ直せば元の文字列に戻る。 */
export interface Segment {
  /** 塊そのもの。 */
  readonly text: string;
  /** この後ろにあった区切り (改行)。 */
  readonly after: string;
  /** 囲みコード。訳さない。 */
  readonly code: boolean;
}

const FENCE = /^\s{0,3}(```|~~~)/;

export function segments(text: string): readonly Segment[] {
  const lines = text.split("\n");
  // 行の頭の位置。塊の範囲を行で決め、切り出しは**元の文字列から**行うので、
  // 空白も改行も数え直さずに元どおりになる。
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  const at = (line: number): number =>
    line >= lines.length ? text.length : (starts[line] as number);

  /** この行から続く塊の終わり (含む)。囲みなら閉じるまで、散文なら空行まで。 */
  const endOf = (from: number): { last: number; code: boolean } => {
    const opens = FENCE.exec(lines[from] as string);
    if (opens !== null) {
      const mark = opens[1] as string;
      for (let scan = from + 1; scan < lines.length; scan += 1) {
        if ((lines[scan] as string).trim().startsWith(mark)) return { last: scan, code: true };
      }
      // 閉じていない囲みは、残り全部が囲みの中。
      return { last: lines.length - 1, code: true };
    }
    for (let scan = from + 1; scan < lines.length; scan += 1) {
      const line = lines[scan] as string;
      if (line.trim() === "" || FENCE.test(line)) return { last: scan - 1, code: false };
    }
    return { last: lines.length - 1, code: false };
  };

  const out: Segment[] = [];
  /** 最初の塊が始まる位置。頭の空白はここまで。 */
  let began = text.length;
  let line = 0;
  while (line < lines.length) {
    if ((lines[line] as string).trim() === "") {
      line += 1;
      continue;
    }
    const { last, code } = endOf(line);
    let next = last + 1;
    while (next < lines.length && (lines[next] as string).trim() === "") next += 1;
    const from = at(line);
    if (out.length === 0) began = from;
    const to = from + text.slice(from, at(last + 1)).replace(/\n$/, "").length;
    out.push({ text: text.slice(from, to), after: text.slice(to, at(next)), code });
    line = next;
  }
  // 頭に立つ空白は、後ろの塊が持つ区切りにできない (持ち主が前に居ない)。
  // 空の塊に持たせる — 訳しに回らないので、繋ぎ直しのためだけに居る。
  const lead = text.slice(0, began);
  if (lead !== "") out.unshift({ text: "", after: lead, code: false });
  return out;
}

/** 塊を繋ぎ直す。区切りを塊が持っているので、訳さなかった所は 1 文字も動かない。 */
function joinSegments(parts: readonly Segment[], texts: readonly string[]): string {
  return parts.map((part, at) => `${texts[at] ?? part.text}${part.after}`).join("");
}

/** 日本語の文字と、比べる相手の英数字。 */
const JAPANESE = /\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Han}/gu;
const LATIN = /[A-Za-z0-9]/g;

/** この割合を超えて日本語が混ざっていれば、その段落は「もう日本語」として
 * 訳さない。
 *
 * 「1 文字でも日本語なら訳さない」にすると、英文の思考の中に人の言葉が一言
 * 引用されただけで段落ぜんぶが英語のまま残る。逆に日本語の技術文は、英語の
 * 識別子が並んでも骨格の かな がこの割合を上回る。 */
const JAPANESE_RATIO = 0.1;

export function isAlreadyJapanese(paragraph: string): boolean {
  if (paragraph.trim() === "") return true;
  const japanese = paragraph.match(JAPANESE)?.length ?? 0;
  if (japanese === 0) return false;
  const latin = paragraph.match(LATIN)?.length ?? 0;
  return japanese / (japanese + latin) > JAPANESE_RATIO;
}

/** 訳す所が 1 段落も無い本文。**切り替えても何も変わらない**ことが先に分かるので、
 * 画面はその item に訳の入口を出さない。 */
export function needsNoTranslation(text: string): boolean {
  return segments(text).every((part) => part.code || isAlreadyJapanese(part.text));
}

/** 訳す人。どちらの経路もこの形で、呼ぶ側は 1 段落ずつ渡す。 */
export interface Translator {
  /** 経路の名前。覚えた訳は経路ごとに分けて持つ — 同じ段落でも訳す人が違えば
   * 別の文で、片方の答えをもう片方の名前で出すことはできない。 */
  readonly route: TranslateRoute;
  translate(paragraph: string): Promise<string>;
}

export type TranslateRoute = "host" | "browser";

/** 経路ごとの、段落 → 訳。 */
const remembered = new Map<string, Map<string, string>>();

function memory(route: TranslateRoute): Map<string, string> {
  const held = remembered.get(route);
  if (held !== undefined) return held;
  const made = new Map<string, string>();
  remembered.set(route, made);
  return made;
}

/** 覚えておく段落の数。開いた本文の総量がそのまま常駐するので、上限を置いて
 * 古い方から捨てる。捨てた段落は次に開いた時にもう 1 度訳されるだけで、表示は
 * 壊れない。 */
const REMEMBER_LIMIT = 512;

function remember(route: TranslateRoute, paragraph: string, text: string): void {
  const held = memory(route);
  held.delete(paragraph);
  held.set(paragraph, text);
  // 入れた順に並ぶ Map なので、最初の鍵が最も古い。
  while (held.size > REMEMBER_LIMIT) {
    const oldest = held.keys().next();
    if (oldest.done === true) break;
    held.delete(oldest.value);
  }
}

/** 今すぐ出せる訳。1 段落も訳せていなければ undefined。
 *
 * 途中まででも返すのは、届いた段落から読めるようにするため — 長い思考の訳は
 * 段落ごとに届くので、全部揃うまで原文のまま固めると数十秒何も変わらない。 */
export function translatedSoFar(route: TranslateRoute, text: string): string | undefined {
  const held = memory(route);
  let any = false;
  const parts = segments(text);
  const texts = parts.map((part) => {
    if (part.code) return part.text;
    const said = held.get(part.text);
    if (said === undefined) return part.text;
    any = true;
    return said;
  });
  return any ? joinSegments(parts, texts) : undefined;
}

/** 本文を訳す。届いた段落から順に `onPartial` へ流し、最後に全体を返す。
 *
 * 段落ごとに独立して投げるのは、1 つの長い段落の後ろで短い段落が待たされない
 * ようにするため。訳せなかった段落は原文のまま残り、覚えない (次に開いた時に
 * もう 1 度試せる)。 */
export async function translateText(
  translator: Translator,
  text: string,
  onPartial?: (partial: string) => void,
): Promise<string> {
  const parts = segments(text);
  const out = parts.map((part) => part.text);
  const held = memory(translator.route);
  await Promise.all(
    parts.map(async (part, index) => {
      if (part.code || isAlreadyJapanese(part.text)) return;
      const said = held.get(part.text) ?? (await one(translator, part.text));
      if (said === undefined || said === out[index]) return;
      out[index] = said;
      onPartial?.(joinSegments(parts, out));
    }),
  );
  return joinSegments(parts, out);
}

/** 同じ段落を同時に 2 度投げない。開いている item が同じ段落を持っていれば、
 * 先に投げた 1 回を両方が待つ。 */
const inFlight = new Map<string, Promise<string | undefined>>();

async function one(translator: Translator, paragraph: string): Promise<string | undefined> {
  const key = `${translator.route} ${paragraph}`;
  const held = inFlight.get(key);
  if (held !== undefined) return held;
  const asked = translator
    .translate(paragraph)
    .then((said) => {
      remember(translator.route, paragraph, said);
      return said;
    })
    .catch(() => undefined)
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, asked);
  return asked;
}

/** 試験のために、覚えたものを全部忘れる。 */
export function forgetTranslations(): void {
  remembered.clear();
  inFlight.clear();
}
