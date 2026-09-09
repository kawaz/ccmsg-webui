// Syntax highlighting via Shiki, driven through a hand-picked fine-grained
// bundle (@shikijs/core + @shikijs/engine-javascript) rather than the full
// `shiki` package or its default oniguruma/wasm engine: the JS regex engine
// avoids shipping a wasm binary, and importing only the
// language grammars this app actually needs (see EXTENSION_LANGUAGE_MAP)
// avoids paying for grammars this UI never displays.
//
// This is NOT a small addition even after trimming: the ts/js/jsx family is
// collapsed onto the single `tsx` grammar (see EXTENSION_LANGUAGE_MAP) because
// the four grammars are ~185KB raw each of near-duplicate JSON, but the
// remaining grammar set + the oniguruma-to-es regex engine still dominate what
// highlighting costs to download. So the engine and every grammar are pulled in
// by `await import()` inside `getHighlighter` rather than at the top of this
// module: the bundler puts them in a chunk of their own, and a session showing
// no code never asks for it. Only the language table and the size gate above it
// are eagerly loaded, which is what lets a caller decide whether to highlight
// without paying for the highlighter. Measure with `bun run build` when
// touching this list.
//
// Tokens are rendered as JSX text nodes carrying an inline `style` string
// (highlight.ts -> CodeBlock.tsx), never through Shiki's `codeToHtml()`/
// innerHTML path, so Preact's own text-node escaping is what protects against
// code that happens to contain `<`/`&`.
import type { HighlighterCore } from "shiki/core";

// Shiki language ids this bundle actually loads (grammar `name`, not
// necessarily the alias used to select it -- e.g. "bash" resolves to the
// "shellscript" grammar via its built-in aliases). Kept as a union (rather
// than plain `string`) so EXTENSION_LANGUAGE_MAP can't drift from the set of
// grammars actually bundled below.
export type HighlightLang =
  | "tsx"
  | "json"
  | "jsonc"
  | "bash"
  | "rust"
  | "go"
  | "python"
  | "html"
  | "css"
  | "markdown"
  | "yaml"
  | "toml"
  | "diff";

// Blocks at or under this size get tokenized; larger ones fall back to plain
// rendering. Shiki's textmate tokenizer is O(n) in content length but with a
// large constant factor (many candidate regexes tried per position) — above
// a few hundred KB this starts to show up as main-thread jank for a
// display-only feature, so it stays conservative.
export const HIGHLIGHT_MAX_BYTES = 200 * 1024;

// Extension (lowercase, without the dot) -> Shiki language id. Only
// extensions actually expected in a typical repo tree, restricted to the
// language grammars bundled above (bundle-size discipline);
// anything else (including dotfiles and extension-less files, e.g.
// `Dockerfile`) resolves to `null` and the plain rendering is used.
const EXTENSION_LANGUAGE_MAP: Record<string, HighlightLang> = {
  // ts/js/jsx 系は全部 tsx グラマー 1 本で代表させる: typescript/javascript/
  // jsx の各グラマーはそれぞれ ~185KB raw の独立 JSON 定義でほぼ重複しており、
  // 4 本積むと bundle が +560KB raw 膨らむ。tsx は TS + JSX の上位互換文法で、
  // 差異は極端なエッジケース (TS の `<T>x` 山括弧キャスト等) の誤ハイライトのみ。
  ts: "tsx",
  mts: "tsx",
  cts: "tsx",
  tsx: "tsx",
  js: "tsx",
  mjs: "tsx",
  cjs: "tsx",
  jsx: "tsx",
  json: "json",
  jsonc: "jsonc",
  css: "css",
  html: "html",
  htm: "html",
  md: "markdown",
  markdown: "markdown",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yml: "yaml",
  yaml: "yaml",
  toml: "toml",
  py: "python",
  rs: "rust",
  go: "go",
  diff: "diff",
  patch: "diff",
};

export function detectLanguage(path: string): HighlightLang | null {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null; // no extension, or a dotfile like ".gitignore"
  const ext = base.slice(dot + 1).toLowerCase();
  return EXTENSION_LANGUAGE_MAP[ext] ?? null;
}

// Gate for whether a block should be tokenized at all: a recognized language
// and a size within HIGHLIGHT_MAX_BYTES.
export function isHighlightEligible(
  lang: HighlightLang | null,
  content: string,
): lang is HighlightLang {
  return lang !== null && content.length <= HIGHLIGHT_MAX_BYTES;
}

export interface HighlightSpan {
  text: string;
  // Inline `--shiki-light`/`--shiki-dark` (+ optional `-font-style`/
  // `-font-weight`) custom-property declarations for this token, already
  // theme-paired by Shiki's dual-theme tokenization (see getHighlighter
  // below). `undefined` for whitespace/plain runs with no styling.
  style?: string;
}

// Highlighter instance is expensive to construct (compiles every bundled
// grammar's textmate patterns) and has no per-call state, so it's built once
// per process and reused. Both themes are loaded up front so every call below
// can request the light/dark pair together (dual-theme tokenization, see
// tokenizeLines) rather than re-tokenizing per theme.
let highlighterPromise: Promise<HighlighterCore> | null = null;
function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= buildHighlighter().catch((err: unknown) => {
    // 構築失敗 (grammar/engine の初期化エラー、chunk の取得失敗等) を rejected
    // promise のまま memo すると、以降の全呼び出しが同じ rejection を再利用して
    // 恒久的にハイライトが無効化される。次回呼び出しで再構築を試みられるよう
    // memo を解放してから re-throw する (tokenizeLines 側の catch で plain
    // fallback)。
    highlighterPromise = null;
    throw err;
  });
  return highlighterPromise;
}

async function buildHighlighter(): Promise<HighlighterCore> {
  const [core, engine, light, dark, ...langs] = await Promise.all([
    import("shiki/core"),
    import("shiki/engine/javascript"),
    import("shiki/themes/github-light.mjs"),
    import("shiki/themes/github-dark.mjs"),
    import("shiki/langs/tsx.mjs"),
    import("shiki/langs/json.mjs"),
    import("shiki/langs/jsonc.mjs"),
    import("shiki/langs/bash.mjs"),
    import("shiki/langs/rust.mjs"),
    import("shiki/langs/go.mjs"),
    import("shiki/langs/python.mjs"),
    import("shiki/langs/html.mjs"),
    import("shiki/langs/css.mjs"),
    import("shiki/langs/markdown.mjs"),
    import("shiki/langs/yaml.mjs"),
    import("shiki/langs/toml.mjs"),
    import("shiki/langs/diff.mjs"),
  ]);
  return core.createHighlighterCore({
    themes: [light.default, dark.default],
    langs: langs.map((lang) => lang.default),
    // JS-regex engine (no wasm) — see module doc comment.
    engine: engine.createJavaScriptRegexEngine(),
  });
}

function styleString(htmlStyle: Record<string, string>): string {
  return Object.entries(htmlStyle)
    .map(([prop, value]) => `${prop}:${value}`)
    .join(";");
}

// Plain-line split used only as the tokenization-failure fallback below (a
// trailing "\n" doesn't produce an extra trailing empty line).
function splitContentLines(src: string): string[] {
  const lines = src.split("\n");
  if (src.endsWith("\n")) lines.pop();
  return lines;
}

// Re-flow Shiki's per-line token arrays into HighlightSpan[][], so the caller
// keeps a per-line row structure. `codeToTokens` already segments by "\n"
// (including a trailing empty line when `src` ends with "\n", popped below to
// match CodeBlock's plain-line splitting) and keeps multi-line tokens (e.g. a
// block comment) correctly attributed to each line they span.
export async function tokenizeLines(src: string, lang: HighlightLang): Promise<HighlightSpan[][]> {
  try {
    // ハイライタ構築の失敗 (getHighlighter) も codeToTokens の失敗も、
    // 同じ「plain fallback」で扱う — どちらも呼び出し側 (CodeBlock) を
    // 「loading」のまま止めない。construction 失敗は
    // getHighlighter 側で memo を解放するので、次回呼び出しで再構築される。
    const highlighter = await getHighlighter();
    const { tokens } = highlighter.codeToTokens(src, {
      lang,
      themes: { light: "github-light", dark: "github-dark" },
      defaultColor: false,
    });
    if (src.endsWith("\n") && tokens.length > 0 && tokens[tokens.length - 1]!.length === 0) {
      tokens.pop();
    }
    return tokens.map((line) =>
      line.map((tok) => ({
        text: tok.content,
        style:
          tok.htmlStyle && Object.keys(tok.htmlStyle).length > 0
            ? styleString(tok.htmlStyle)
            : undefined,
      })),
    );
  } catch {
    // Pathological input the grammar can't tokenize (regex-engine guard
    // trip, malformed embedded-language fence, etc.) — degrade to plain,
    // unstyled lines rather than reject and leave the caller stuck on its
    // "loading" state forever.
    return splitContentLines(src).map((line) => (line === "" ? [] : [{ text: line }]));
  }
}
