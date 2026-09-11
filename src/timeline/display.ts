/** 型ごとの表示属性 — その型の item を画面のどこに、どこまで開いて出すか。
 *
 * 型名は `:` 区切りの階層なので、設定も階層で読む: `tool` に付けた値は
 * `tool:Bash` にも効き、`tool:Bash` に付けた値がその 1 つだけを上書きする。
 * 何も付いていない型は組み込みの既定に落ちる。これで、知らない型が来ても
 * 「その根が言っていること」で描け、読み手が気にした型だけを名指しで動かせる。
 *
 * 2 軸だけを持つ:
 *
 * - `top` — TL のトップ層に立つか。false の item は、続いた分がまとめて
 *   1 つの畳み (`N item`) に入る
 * - `open` — 既定で開いているか。畳みに入る item ではその畳みが開くかを決め、
 *   本文を持つ item (会話・思考) ではその本文が開いているかを決める */

export interface Display {
  readonly top: boolean;
  readonly open: boolean;
}

/** 誰の transcript を読んでいるか。表は主語ごとに 1 面持つ — 同じ `tool:Bash`
 * でも、main では会話の傍らで起きたことで、worker ではその worker が**やった
 * こと**そのもの。読む理由が違うものに 1 つの既定を押し付けない。 */
export type Subject = "main" | "sub";

export const SUBJECTS: readonly Subject[] = ["main", "sub"];

/** 今読んでいる面。継ぎ方は主語ごとに閉じていて、面をまたいで継ぐことはない。 */
export interface DisplayFace {
  readonly subject: Subject;
  readonly settings: DisplaySettings;
}

export type DisplayAxis = keyof Display;

export const DISPLAY_AXES: readonly DisplayAxis[] = ["top", "open"];

/** 読み手が名指しで付けた値。軸ごとに独立して付く — `tool` の既定を継いだまま
 * `tool:Bash` の `top` だけを変える、が書ける形。 */
export type DisplaySettings = Readonly<Record<string, Partial<Display>>>;

/** どの型も名乗らなかった時の値。会話でも思考でもないものは畳みの中に居て、
 * 開くかどうかは読み手が決める。 */
const ROOT: Display = { top: false, open: false };

/** 組み込みの既定。読み手が何も触っていない画面が出すもの。
 *
 * main は**会話**を読む画面。人とのやりとりと思考が本文ごと立ち、道具は会話の
 * 傍らで起きたこととして畳みに入る。
 *
 * sub は**やり方**を読む画面。worker を開くのはその worker が何を叩いて何を
 * 読んだかを見るためなので、道具はトップ層に 1 行ずつ並べて順番が追えるように
 * し、本文は閉じておく (開くと 1 件で画面が埋まって順番が読めない)。思考も
 * 同じ理由で閉じる。会話は worker では数が少なく、親からの指示と返した答えな
 * ので本文ごと出す。 */
const BUILTIN: Readonly<Record<Subject, Readonly<Record<string, Partial<Display>>>>> = {
  main: {
    message: { top: true, open: true },
    thinking: { top: true, open: true },
  },
  sub: {
    message: { top: true, open: true },
    thinking: { top: true, open: false },
    tool: { top: true, open: false },
  },
};

/** その型と、その型を含む上の型を、近い順に。`tool:Bash` なら
 * `["tool:Bash", "tool"]`。 */
export function typeAncestry(type: string): readonly string[] {
  const names: string[] = [];
  let at = type;
  for (;;) {
    names.push(at);
    const cut = at.lastIndexOf(":");
    if (cut < 0) return names;
    at = at.slice(0, cut);
  }
}

/** その型のその軸が、どの型名から来ているか。読み手が付けた値が無ければ組み込み
 * が答え、それも無ければ根の既定なので `undefined`。 */
function valueOf(face: DisplayFace, type: string, axis: DisplayAxis): boolean | undefined {
  const builtin = BUILTIN[face.subject];
  for (const name of typeAncestry(type)) {
    const own = face.settings[name]?.[axis];
    if (own !== undefined) return own;
    const said = builtin[name]?.[axis];
    if (said !== undefined) return said;
  }
  return undefined;
}

export function resolveDisplay(face: DisplayFace, type: string): Display {
  return {
    top: valueOf(face, type, "top") ?? ROOT.top,
    open: valueOf(face, type, "open") ?? ROOT.open,
  };
}

/** その軸の値が、この型そのものに読み手が付けたものか。false は「上の型か組み
 * 込みから継いでいる」で、画面はそれを薄く出す。 */
export function isOwnValue(settings: DisplaySettings, type: string, axis: DisplayAxis): boolean {
  return settings[type]?.[axis] !== undefined;
}

/** その型のその軸に値を付ける。 */
export function setDisplay(
  settings: DisplaySettings,
  type: string,
  axis: DisplayAxis,
  value: boolean,
): DisplaySettings {
  return { ...settings, [type]: { ...settings[type], [axis]: value } };
}

/** その型に付けた値を外す。外した後は上の型か組み込みが答える。 */
export function clearDisplay(settings: DisplaySettings, type: string): DisplaySettings {
  if (settings[type] === undefined) return settings;
  const next = { ...settings };
  delete next[type];
  return next;
}

/** 設定画面に並べる型。組み込みが名乗っている型と、この画面で実際に見た型、
 * そして読み手が既に値を付けた型。
 *
 * 見た型はその上の型も一緒に並べる — `tool:Bash` を見たなら `tool` にまとめて
 * 付けられる所が要る。並びは型名そのもので、階層がそのまま隣り合う。 */
export function displayRows(face: DisplayFace, observed: Iterable<string>): readonly string[] {
  const names = new Set<string>([
    ...Object.keys(BUILTIN[face.subject]),
    ...Object.keys(face.settings),
  ]);
  for (const type of observed) for (const name of typeAncestry(type)) names.add(name);
  return [...names].sort();
}

/** 表示属性を覚えておく所。主語の面だけで分かれ、instance もセッションも名前に
 * 入らない。
 *
 * 「思考は畳む」「道具はトップ層に並べる」は**この人の読み方**であって、どの
 * instance のどのセッションを見ているかの都合ではない。instance を名前に入れる
 * と、同じ人が別の instance を開いた時に読み方を決め直すことになる。面で分かれ
 * るのは、main と worker で読む理由そのものが違うから。 */
export function displayStorageKey(subject: Subject): string {
  return `ccmsg.timeline.display:${subject}`;
}

/** 型名として読めるもの。契約の `TranscriptItemType` と同じ形。 */
const TYPE_NAME = /^[a-z]+(?::[A-Za-z0-9_.-]+)*$/;

/** 覚えていた値を読む。壊れた entry はその entry だけ捨てる — 1 つの型の値が
 * 読めなかったことで、他の型に付けた値まで失う理由は無い。 */
export function parseDisplaySettings(raw: string | null | undefined): DisplaySettings {
  if (raw === null || raw === undefined) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  const settings: Record<string, Partial<Display>> = {};
  for (const [type, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!TYPE_NAME.test(type)) continue;
    if (typeof value !== "object" || value === null) continue;
    const held = value as Record<string, unknown>;
    const one: { top?: boolean; open?: boolean } = {};
    if (typeof held.top === "boolean") one.top = held.top;
    if (typeof held.open === "boolean") one.open = held.open;
    if (one.top !== undefined || one.open !== undefined) settings[type] = one;
  }
  return settings;
}

export function formatDisplaySettings(settings: DisplaySettings): string {
  return JSON.stringify(settings);
}
