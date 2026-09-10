import { useEffect, useState } from "preact/hooks";
import {
  detectLanguage,
  type HighlightSpan,
  isHighlightEligible,
  tokenizeLines,
} from "../markdown/highlight.ts";
import type { SearchWord } from "../search/in-view-search.ts";
import { markedSpans, markedText } from "./search-marks.tsx";

/** One fenced code block.
 *
 * The text is shown immediately and the colours arrive afterwards, because the
 * highlighter and its grammars are the largest thing this app can download and
 * are fetched only once a block that can use them is on screen (see
 * highlight.ts). A fence's info-string language name (`ts`, `py`) is looked up
 * by treating it as a filename extension, which is the same table a path would
 * go through.
 *
 * 探している言葉は色が届く前でも後でも光る。届いた後は 1 行が span の列に
 * なっているので、一致が span の境界をまたいでも切り直して光らせる
 * (`splitSpansForHighlight`) — 色付けの区切りはそのまま残る。 */
export function CodeBlock({
  code,
  lang,
  highlight,
}: {
  code: string;
  lang: string | null;
  highlight?: readonly SearchWord[];
}) {
  const words = highlight ?? [];
  const language = lang ? detectLanguage(`_.${lang.toLowerCase()}`) : null;

  // Keyed by `code` so a fast re-render with different fence content cannot
  // paint stale highlighted spans over new text.
  const [highlighted, setHighlighted] = useState<{ code: string; lines: HighlightSpan[][] } | null>(
    null,
  );
  useEffect(() => {
    if (!isHighlightEligible(language, code)) return;
    let cancelled = false;
    void tokenizeLines(code, language).then((lines) => {
      if (!cancelled) setHighlighted({ code, lines });
    });
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  const lines = highlighted !== null && highlighted.code === code ? highlighted.lines : null;

  if (lines === null) {
    return (
      <pre class="md-code">
        <code>{markedText(code, words)}</code>
      </pre>
    );
  }

  return (
    <pre class="md-code">
      <code>
        {lines.map((spans, i) => (
          <span class="md-code-line" key={i}>
            {markedSpans(spans, words)}
            {i < lines.length - 1 ? "\n" : null}
          </span>
        ))}
      </code>
    </pre>
  );
}
