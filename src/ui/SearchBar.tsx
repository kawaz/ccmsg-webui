import { computed, type ReadonlySignal, type Signal, useSignal } from "@preact/signals";
import { useEffect, useMemo, useRef } from "preact/hooks";
import {
  nextIndex,
  parseSearchQuery,
  prevIndex,
  type SearchWord,
} from "../search/in-view-search.ts";

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

/** 打鍵が文字を入れている最中か。検索の呼び出し (`/`) を、文章を打っている
 * 人から奪わないため。 */
function typingSomewhere(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable === true
  );
}

export function SearchBar({
  search,
  matched,
  onReveal,
}: {
  search: InViewSearchState;
  /** 一致したかたまりの名前を、出てくる順に。 */
  matched: readonly string[];
  /** その 1 つを画面に出す (畳まれていれば開いてから)。 */
  onReveal: (key: string) => void;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const total = matched.length;
  const current = search.index.value;

  // `/` と ⌘F でここに来る。標準の検索は畳まれた中身に効かず、PWA では
  // そもそも開けないので、⌘F は横取りする。
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const isFind = event.key === "f" && (event.metaKey || event.ctrlKey);
      const isSlash = event.key === "/" && !typingSomewhere(event.target);
      if (!isFind && !isSlash) return;
      event.preventDefault();
      search.editing.value = true;
      requestAnimationFrame(() => box.current?.focus());
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [search]);

  // 今どこかは描いた時の値ではなく signal から取る: 連打すると次の描画を
  // 待たずに 2 度目が走り、同じ所から数え直してしまう。
  const move = (step: (from: number) => number) => {
    const to = step(search.index.value);
    if (to === 0) return;
    search.index.value = to;
    const key = matched[to - 1];
    if (key !== undefined) onReveal(key);
  };

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
      <button
        type="button"
        aria-label="前の一致へ"
        disabled={total === 0}
        onClick={() => {
          move((from) => prevIndex(from, total));
        }}
      >
        ↑
      </button>
      <button
        type="button"
        aria-label="次の一致へ"
        disabled={total === 0}
        onClick={() => {
          move((from) => nextIndex(from, total));
        }}
      >
        ↓
      </button>
      <button
        type="button"
        aria-label="検索をやめる"
        onClick={() => {
          search.query.value = "";
          search.index.value = 0;
          search.editing.value = false;
        }}
      >
        ✕
      </button>
    </p>
  );
}
