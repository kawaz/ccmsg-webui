import { useEffect, useRef, useState } from "preact/hooks";
import { type FileWordHits, fileWordView } from "./file-word.ts";
import type { FileWordCtx } from "./markdown-view.tsx";
import { watchInView } from "../ui/in-view.ts";

/** ファイルの名前らしき語 1 つ。
 *
 * 見た目は素の inline code のまま始まり、そういうファイルが在ると分かった時
 * だけ渡りが付く。在ると分かるまでに待つ印は出さない — 何も出ない語の方が
 * ずっと多いので、待つ印を出すと文書が点滅するだけになる。
 *
 * 訊くのは画面に出てからで、出ていない間は何も訊かない (`in-view.ts`)。
 * 1 つの文書に語は数十あり、その大半は読み手が最後まで辿り着かない。 */
export function FileWord({ word, ctx }: { word: string; ctx: FileWordCtx }) {
  const box = useRef<HTMLSpanElement>(null);
  const [hits, setHits] = useState<FileWordHits | undefined>(undefined);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (el === null) return;
    let unsubscribe: (() => void) | undefined;
    const stop = watchInView(el, (seen) => {
      // 一度出たらもう外さない。答えは覚えられているので、行き来のたびに
      // 訊き直すことはなく、外した所で省けるのは listener 1 つだけ。
      if (!seen || unsubscribe !== undefined) return;
      const read = () => setHits(ctx.lookup(word));
      unsubscribe = ctx.subscribe(read);
      read();
    });
    return () => {
      stop();
      unsubscribe?.();
    };
  }, [word, ctx]);

  // 開いている一覧は、外を押しても Escape でも閉じる。文書の中に開くものなので
  // 「どこか別の所を読み始めた」がそのまま閉じる合図になる。
  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      const el = box.current;
      if (el !== null && event.target instanceof Node && el.contains(event.target)) return;
      setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const view = fileWordView(hits, open);
  const code = <code class="md-inline-code">{word}</code>;

  if (view.kind === "single") {
    const to = ctx.linkTo(view.path);
    if (to !== undefined) {
      return (
        <span ref={box} class="md-file-word">
          <a class="md-path-link" href={to.href} title={view.path} onClick={to.onClick}>
            {code}
          </a>
        </span>
      );
    }
  }

  if (view.kind !== "candidates") {
    return (
      <span ref={box} class="md-file-word">
        {code}
      </span>
    );
  }

  return (
    <span ref={box} class="md-file-word">
      {/* 語と印は離さない。印だけが次の行の頭に落ちると、何に付いた印か
          読めなくなる。一覧の方は離れてよい (行が伸びる方を選ぶ)。 */}
      <span class="md-file-word-name">
        {code}
        <button
          type="button"
          class="md-file-word-more"
          aria-expanded={open}
          title={`名前の合うファイル ${view.paths.length} 件`}
          onClick={() => setOpen(!open)}
        >
          📄
        </button>
      </span>
      {view.open && (
        <span class="md-file-word-menu">
          {view.paths.map((path) => {
            const to = ctx.linkTo(path);
            return to === undefined ? (
              <span key={path}>{path}</span>
            ) : (
              <a
                key={path}
                href={to.href}
                onClick={(event: MouseEvent) => {
                  setOpen(false);
                  to.onClick?.(event);
                }}
              >
                {path}
              </a>
            );
          })}
        </span>
      )}
    </span>
  );
}
