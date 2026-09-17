/** 打鍵の 3 つの姿 — 保存する意味、人が書く綴り、画面に見せる表記 (DR-0003 §2.5)。
 *
 * 1 つの文字列に兼ねさせるとどれかが必ず無理をするので、意味は構造で持ち、
 * 文字列は `parse` / `format` / `display` の境目にだけ置く。 */

/** 人が書く修飾子。`CmdOrCtrl` は **今の platform の主要な修飾子 1 つに解決する**
 * — mac なら Command、それ以外なら Control。**論理和ではない**: mac で Control は
 * 端末の制御文字・Emacs 系の手・VoiceOver が使っていて、両方で発火させるとそれ
 * らを巻き込んで奪う。 */
export const MODIFIERS = ["CmdOrCtrl", "Cmd", "Ctrl", "Alt", "Shift"] as const;
export type Modifier = (typeof MODIFIERS)[number];

/** 保存する意味。`code` は `KeyboardEvent.code` (配列に左右されない物理位置)、
 * `modifiers` は集合なので順序と重複がここで正規化される — `Shift+CmdOrCtrl+KeyK`
 * と `CmdOrCtrl+Shift+KeyK` は同じ binding になる。 */
export interface Binding {
  readonly code: string;
  readonly modifiers: ReadonlySet<Modifier>;
  /** その platform でだけ有効にする (§2.5)。無ければ全 platform で有効。
   *
   * 要るのは `CmdOrCtrl` が吸収できるのが「同じ機能が Command 対 Control で
   * 対応している」場合だけだから — mac の `Ctrl` は他の platform の `Ctrl` と
   * 役割が違うので、空いている組み合わせが一致しない。 */
  readonly only?: Platform;
  /** 警告を承知で通す (§2.5)。予約には効かない。 */
  readonly force?: true;
}

export type Platform = "mac" | "other";

/** platform に解決した後の姿。ブラウザが見せる 4 つの boolean と同じ形で、
 * 照合も衝突の検査もここに揃えてから行う。 */
export interface Resolved {
  readonly code: string;
  readonly meta: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
}

/** 今の platform。判定は表示と解決のためだけに使い、**保存する意味には混ぜない**
 * — 設定を別の platform へ持ち運んでも綴りの意味は変わらない。
 *
 * `navigator.platform` は互換目的の情報なので、あれば User-Agent Client Hints の
 * 方を先に読む。どちらも読めなければ mac ではない側に倒す (記号に翻訳しない方が
 * 誤読が少ない)。 */
export function platformNow(): Platform {
  const hinted = (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform;
  const said = hinted ?? navigator.platform;
  return /mac/i.test(said) ? "mac" : "other";
}

/** 綴りに書ける別名。正規形は `MODIFIERS` の綴りで、`format` はそちらへ戻す。 */
const ALIASES: Readonly<Record<string, Modifier>> = {
  cmdorctrl: "CmdOrCtrl",
  commandorcontrol: "CmdOrCtrl",
  cmd: "Cmd",
  command: "Cmd",
  meta: "Cmd",
  ctrl: "Ctrl",
  control: "Ctrl",
  alt: "Alt",
  option: "Alt",
  shift: "Shift",
};

/** 綴りに書かれた `code` を UI Events の綴りへ揃える。
 *
 * 手で書いた `cmd+keyk` と、設定画面がキーを受け取って作った `Cmd+KeyK` が同じ
 * binding になる所まで。**当てはまる形が無ければ書かれたまま**にする — 知らない
 * 名前を推測で直すと、人が書いたものと違うキーに結ばれる。 */
function canonicalCode(code: string): string {
  const family = /^(key|digit|arrow|numpad|f)(\d+|[a-z]+)$/i.exec(code);
  if (family === null) return code;
  const head = (family[1] as string).toLowerCase();
  const tail = family[2] as string;
  if (head === "f") return /^\d+$/.test(tail) ? `F${tail}` : code;
  if (head === "key" || head === "arrow" || head === "numpad") {
    const name = `${head[0]?.toUpperCase() ?? ""}${head.slice(1)}`;
    return `${name}${tail[0]?.toUpperCase() ?? ""}${tail.slice(1).toLowerCase()}`;
  }
  return /^\d$/.test(tail) ? `Digit${tail}` : code;
}

export interface ParseFailure {
  readonly problem: string;
}

export function isFailure(read: Binding | ParseFailure): read is ParseFailure {
  return "problem" in read;
}

/** 綴りを読む。読めない語は**推測して受理しない** — 何が書けるかを言って返す。 */
export function parseBinding(spell: string): Binding | ParseFailure {
  const parts = spell
    .split("+")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  const code = parts.pop();
  if (code === undefined) return { problem: "キーが書かれていません" };
  const modifiers = new Set<Modifier>();
  for (const part of parts) {
    const known = ALIASES[part.toLowerCase()];
    if (known === undefined) {
      return { problem: `${part} は修飾キーではありません (${MODIFIERS.join(" / ")})` };
    }
    modifiers.add(known);
  }
  // `CmdOrCtrl` はどちらか 1 つへの**置き換え**なので、解決先を一緒に書くと
  // 意味が二重になる。読めない綴りとして断る方が、片方を黙って落とすより良い。
  if (modifiers.has("CmdOrCtrl") && (modifiers.has("Cmd") || modifiers.has("Ctrl"))) {
    return { problem: "CmdOrCtrl は Cmd / Ctrl と一緒には書けません (どちらか 1 つに解決します)" };
  }
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(code)) {
    return { problem: `${code} はキーの名前ではありません (KeyK、Digit1、ArrowUp など)` };
  }
  return { code: canonicalCode(code), modifiers };
}

/** 覚える綴り。順序はここで正規形に戻る。 */
export function formatBinding(binding: Binding): string {
  const parts = MODIFIERS.filter((one) => binding.modifiers.has(one));
  return [...parts, binding.code].join("+");
}

/** platform に解決する。`CmdOrCtrl` はここで初めて 1 つの物理キーになる。 */
export function resolveBinding(binding: Binding, platform: Platform): Resolved {
  const has = (one: Modifier): boolean => binding.modifiers.has(one);
  const primary = has("CmdOrCtrl");
  return {
    code: binding.code,
    meta: has("Cmd") || (primary && platform === "mac"),
    ctrl: has("Ctrl") || (primary && platform === "other"),
    alt: has("Alt"),
    shift: has("Shift"),
  };
}

/** その binding が今の platform で有効か (§2.5 の platform 限定)。 */
export function appliesTo(binding: Binding, platform: Platform): boolean {
  return binding.only === undefined || binding.only === platform;
}

/** 照合の鍵。解決後の姿を 1 つの文字列にしたもので、イベントからも同じ形を作る。 */
export function resolvedKey(resolved: Resolved): string {
  return [
    resolved.meta ? "M" : "",
    resolved.ctrl ? "C" : "",
    resolved.alt ? "A" : "",
    resolved.shift ? "S" : "",
    resolved.code,
  ].join("");
}

export function eventKey(event: KeyboardEvent): string {
  return resolvedKey({
    code: event.code,
    meta: event.metaKey,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
  });
}

/** mac の記号。Apple のメニュー表記に `+` は入らない。 */
const MAC_SYMBOLS: Readonly<Record<string, string>> = {
  ctrl: "⌃",
  alt: "⌥",
  shift: "⇧",
  meta: "⌘",
};

/** `code` を刻印に近い形へ。読めない code はその名前のまま出す — 勝手な当てを
 * 見せるより、設定に書いた綴りがそのまま出る方が結び付けられる。 */
export function keyLabel(code: string): string {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1] as string;
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1] as string;
  const named: Readonly<Record<string, string>> = {
    BracketLeft: "[",
    BracketRight: "]",
    Slash: "/",
    Backslash: "\\",
    Comma: ",",
    Period: ".",
    Semicolon: ";",
    Quote: "'",
    Minus: "-",
    Equal: "=",
    Backquote: "`",
    Space: "Space",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
  };
  return named[code] ?? code;
}

/** 画面に見せる表記。**今の platform に解決した形**で出す (§2.5)。
 *
 * mac は記号を繋げ、それ以外は語を `+` で結ぶ。設定の入力欄には綴りの方を置き、
 * こちらは添え書きとして隣に出る — 記号だけでは設定に転記できず、綴りだけでは
 * 実際にどのキーかが分からない。 */
export function displayBinding(binding: Binding, platform: Platform): string {
  const at = resolveBinding(binding, platform);
  if (platform === "mac") {
    return [
      at.ctrl ? MAC_SYMBOLS.ctrl : "",
      at.alt ? MAC_SYMBOLS.alt : "",
      at.shift ? MAC_SYMBOLS.shift : "",
      at.meta ? MAC_SYMBOLS.meta : "",
      keyLabel(at.code),
    ].join("");
  }
  return [
    ...(at.ctrl ? ["Ctrl"] : []),
    ...(at.alt ? ["Alt"] : []),
    ...(at.shift ? ["Shift"] : []),
    ...(at.meta ? ["Meta"] : []),
    keyLabel(at.code),
  ].join("+");
}

/** ブラウザがページに渡さないと**実測した**組み合わせ (DR-0003 §2.5 の表)。
 *
 * 2026-09-17、macOS の Chrome 152 と Safari で、物理キーとして送って keydown が
 * 届くかを観測したもの。**片方でも届かなければ予約**として扱う — 人が今どの
 * ブラウザを使っているかをこちらが当てにいくと、外した時に何も言わずに効か
 * なくなる。
 *
 * **Windows / Linux は未検証**なので 1 つも載せない。推測で足すと、実際には
 * 使える組み合わせを「効きません」と言うことになる。 */
const RESERVED_ON_MAC: readonly string[] = [
  "MKeyW",
  "MKeyT",
  "MKeyN",
  "MKeyQ",
  "MSKeyN",
  "MSKeyT",
  "MKeyL",
  "MKeyR",
  "CTab",
  "CSTab",
  ...Array.from({ length: 9 }, (_, at) => `MDigit${String(at + 1)}`),
];

/** 奪えてしまうが、奪うと何が失われるかを先に言う組み合わせ (§2.5)。
 *
 * 禁止ではない。自分のブラウザで ⌘F を使わない人から、こちらの都合でその
 * 組み合わせを取り上げる理由が無いので、`force` を付ければ通る。 */
const WARNED: Readonly<
  Record<Platform, readonly { readonly keys: readonly string[]; readonly lost: string }[]>
> = {
  // **platform ごとに分けて持つ**。混ぜると、mac の `Ctrl+F` (ブラウザは何も
  // していない) を「ページ内検索を奪う」と断ることになる — platform 限定の
  // binding が要るのと同じ理由がここにも出る。
  mac: [
    { keys: ["MKeyF"], lost: "ブラウザのページ内検索" },
    { keys: ["MKeyL", "MKeyK"], lost: "アドレスバー" },
    { keys: ["MKeyT", "MKeyW"], lost: "タブを作る / 閉じる" },
    { keys: ["MKeyR"], lost: "再読み込み" },
    { keys: ["MKeyS", "MKeyP"], lost: "保存 / 印刷" },
    { keys: ["MKeyJ", "MKeyD"], lost: "ダウンロード / ブックマーク" },
    {
      keys: ["CTab", "CSTab", ...Array.from({ length: 9 }, (_, at) => `MDigit${String(at + 1)}`)],
      lost: "タブを移る",
    },
    { keys: ["MBracketLeft", "MBracketRight"], lost: "戻る / 進む" },
    { keys: ["MAKeyI"], lost: "開発者ツール" },
    { keys: ["MCKeyF"], lost: "全画面" },
  ],
  other: [
    { keys: ["CKeyF"], lost: "ブラウザのページ内検索" },
    { keys: ["CKeyL", "CKeyK"], lost: "アドレスバー" },
    { keys: ["CKeyT", "CKeyW"], lost: "タブを作る / 閉じる" },
    { keys: ["CKeyR", "F5"], lost: "再読み込み" },
    { keys: ["CKeyS", "CKeyP"], lost: "保存 / 印刷" },
    { keys: ["CKeyJ", "CKeyD"], lost: "ダウンロード / ブックマーク" },
    {
      keys: ["CTab", "CSTab", ...Array.from({ length: 9 }, (_, at) => `CDigit${String(at + 1)}`)],
      lost: "タブを移る",
    },
    { keys: ["AArrowLeft", "AArrowRight"], lost: "戻る / 進む" },
    { keys: ["CSKeyI", "F12"], lost: "開発者ツール" },
    { keys: ["F11"], lost: "全画面" },
  ],
};

/** その割り当てについて人に言うこと。 */
export type Verdict =
  | { readonly at: "clear" }
  /** 奪えてしまう。`force` が付いていれば通り、付いていなければ断る。 */
  | { readonly at: "warned"; readonly lost: string }
  /** 設定はできるが効かない。断るのではなく、**効かないことを表示する** —
   * 割り当てたのに何も起きない時、それが書き間違いなのかブラウザの仕業なのかは、
   * 画面に出ていなければ人には分からない。 */
  | { readonly at: "reserved" };

export function checkBinding(binding: Binding, platform: Platform): Verdict {
  const key = resolvedKey(resolveBinding(binding, platform));
  if (platform === "mac" && RESERVED_ON_MAC.includes(key)) return { at: "reserved" };
  const warned = WARNED[platform].find((one) => one.keys.includes(key));
  if (warned !== undefined) return { at: "warned", lost: warned.lost };
  return { at: "clear" };
}

/** その割り当てが今の platform で実際に効くか。予約は `force` でも効かない。 */
export function bindingWorks(binding: Binding, platform: Platform): boolean {
  if (!appliesTo(binding, platform)) return false;
  const verdict = checkBinding(binding, platform);
  if (verdict.at === "reserved") return false;
  return verdict.at === "clear" || binding.force === true;
}
