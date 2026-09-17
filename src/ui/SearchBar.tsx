import { computed, type ReadonlySignal, type Signal, useSignal } from "@preact/signals";
import { useEffect, useMemo, useRef } from "preact/hooks";
import {
  nextIndex,
  parseSearchQuery,
  prevIndex,
  type SearchWord,
} from "../search/in-view-search.ts";
import { Act, useAction } from "./Scope.tsx";

/** 表示中のものを探す窓 (DR-0022)。
 *
 * 窓が持つのは打った文字と 2 つのトグルと今どこを見ているかだけで、何が
 * 一致するかは持たない — 一致するかたまりを知っているのは Timeline や
 * ファイル本文の側なので、数えた並びを渡してもらい、移動先の名前を返す。 */
export interface InViewSearchState {
  readonly query: Signal<string>;
  readonly caseSensitive: Signal<boolean>;
  readonly regex: Signal<boolean>;
  /** 入力欄を開いているか。閉じるとワードがチップ 1 列になる。 */
  readonly editing: Signal<boolean>;
  /** いま何番目を見ているか (1 始まり、一致なしは 0)。 */
  readonly index: Signal<number>;
  readonly words: ReadonlySignal<readonly SearchWord[]>;
  readonly hasError: ReadonlySignal<boolean>;
}

export function useInViewSearch(): InViewSearchState {
  const query = useSignal("");
  const caseSensitive = useSignal(false);
  const regex = useSignal(false);
  const editing = useSignal(false);
  const index = useSignal(0);
  const parsed = useMemo(
    () =>
      computed(() =>
        parseSearchQuery(query.value, {
          caseSensitive: caseSensitive.value,
          regex: regex.value,
        }),
      ),
    [query, caseSensitive, regex],
  );
  const words = useMemo(() => computed(() => parsed.value.words), [parsed]);
  const hasError = useMemo(() => computed(() => parsed.value.hasError), [parsed]);
  return { query, caseSensitive, regex, editing, index, words, hasError };
}

export function SearchBar({
  search,
  matched,
  onReveal,
}: {
  search: InViewSearchState;
  /** 一致したかたまりの名前を、出てくる順に。
   *
   * **signal で受ける**。アクションの「できるか」がここを読むので、ただの値だと
   * 一致の数が変わったことが押す所に伝わらない — props が同じままの押す所は
   * 描き直されず、無効なボタンがそこに残る。 */
  matched: ReadonlySignal<readonly string[]>;
  /** その 1 つを画面に出す (畳まれていれば開いてから)。 */
  onReveal: (key: string) => void;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const total = matched.value.length;
  const current = search.index.value;

  // 窓が開いたら打てる所へ。開く道が 🔍 だけではなくなった (区画の `/` からも
  // 開く) ので、開けた側ではなくここが面倒を見る。
  const editing = search.editing.value;
  useEffect(() => {
    if (editing) box.current?.focus();
  }, [editing]);

  // ここを開くのは 🔍 だけ。打鍵では開かない — ブラウザの持ち物である打鍵を
  // 画面が横取りすると、この窓が畳んだ中身まで探せる代わりに、ページの中を
  // 探す標準の手が使えなくなる。
  //
  // 今どこかは描いた時の値ではなく signal から取る: 連打すると次の描画を
  // 待たずに 2 度目が走り、同じ所から数え直してしまう。
  const move = (step: (from: number) => number) => {
    const to = step(search.index.value);
    if (to === 0) return;
    search.index.value = to;
    const key = matched.value[to - 1];
    if (key !== undefined) onReveal(key);
  };

  useAction("search.prev-match", {
    enabled: () => matched.value.length > 0,
    run: () => {
      move((from) => prevIndex(from, matched.value.length));
    },
  });
  useAction("search.next-match", {
    enabled: () => matched.value.length > 0,
    run: () => {
      move((from) => nextIndex(from, matched.value.length));
    },
  });
  useAction("search.close", {
    enabled: () => search.editing.value || search.query.value !== "",
    run: () => {
      search.query.value = "";
      search.index.value = 0;
      search.editing.value = false;
    },
  });

  if (!search.editing.value && search.query.value === "") {
    return (
      <p class="search">
        <button
          type="button"
          class="search-open"
          aria-label="この画面の中を探す"
          onClick={() => {
            search.editing.value = true;
            requestAnimationFrame(() => box.current?.focus());
          }}
        >
          🔍
        </button>
      </p>
    );
  }

  return (
    <p class="search">
      <button
        type="button"
        class="search-open"
        aria-label="この画面の中を探す"
        onClick={() => {
          search.editing.value = !search.editing.value;
        }}
      >
        🔍
      </button>
      {search.editing.value ? (
        <>
          <textarea
            ref={box}
            class="search-input"
            rows={1}
            value={search.query.value}
            aria-label="探す言葉 (空白で AND、改行で OR)"
            placeholder="空白で AND、改行で OR"
            onInput={(event) => {
              search.query.value = event.currentTarget.value;
              search.index.value = 0;
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                search.editing.value = false;
                return;
              }
              if (event.key !== "Enter" || event.shiftKey) return;
              event.preventDefault();
              move((from) => nextIndex(from, total));
            }}
          />
          <button
            type="button"
            class={search.caseSensitive.value ? "on" : undefined}
            title="大文字と小文字を区別する"
            onClick={() => {
              search.caseSensitive.value = !search.caseSensitive.value;
            }}
          >
            Aa
          </button>
          <button
            type="button"
            class={search.regex.value ? "on" : undefined}
            title="正規表現として読む"
            onClick={() => {
              search.regex.value = !search.regex.value;
            }}
          >
            .*
          </button>
        </>
      ) : (
        <span class="search-words">
          {search.words.value.map((word, at) => (
            <span key={at} class="search-chip" data-search-color={word.color}>
              {word.text}
            </span>
          ))}
        </span>
      )}
      {search.hasError.value && <span class="search-bad">読めない正規表現があります</span>}
      <span class="search-count">
        [{total === 0 ? 0 : current}/{total}]
      </span>
      <Act action="search.prev-match" label="前の一致へ">
        ↑
      </Act>
      <Act action="search.next-match" label="次の一致へ">
        ↓
      </Act>
      <Act action="search.close" label="検索をやめる">
        ✕
      </Act>
    </p>
  );
}
