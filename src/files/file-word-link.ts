import { useMemo } from "preact/hooks";
import type { Sid } from "@ccmsg/protocol";
import { href } from "../base.ts";
import type { FileWordCtx } from "../markdown/markdown-view.tsx";
import { selectFileWordHits } from "./file-word-find.ts";
import { filesRouteAt } from "./path-link.ts";
import type { Route } from "../route.ts";
import { fileWords } from "../state.ts";

/** ファイルの名前らしき語を繋ぐ先を 1 つ組み立てる。
 *
 * `base` は **その語が書かれていた場所** で、これが呼び手ごとに違う唯一の
 * ところ。会話の吹き出しなら session の作業 folder、文書のプレビューなら
 * その文書が置かれている folder — 文書の中の `sibling-notes` は隣の
 * ファイルを指す、という markdown の読み方そのもの。
 *
 * 探した結果自体は場所に依らないので、覚えるのは語ごとに 1 回きり
 * (`FileWordIndex`)。場所で変わるのは、返ってきた並びからどれを選ぶかだけ。 */
export function useFileWords(sid: Sid, base: string, openAt: (route: Route) => void): FileWordCtx {
  return useMemo(
    () => ({
      lookup(word: string) {
        const hits = fileWords.hitsFor(sid, word);
        return hits === undefined ? undefined : selectFileWordHits(word, base, hits);
      },
      subscribe(listener: () => void) {
        return fileWords.subscribe(listener);
      },
      linkTo(path: string) {
        const to = filesRouteAt(sid, path);
        return {
          href: href(to),
          onClick(event: MouseEvent) {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            openAt(to);
          },
        };
      },
    }),
    [sid, base, openAt],
  );
}
