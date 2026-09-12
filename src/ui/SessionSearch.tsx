import { useSignal } from "@preact/signals";
import type { SessionSearchHit, SessionSearchResult } from "@ccmsg/protocol";
import { DEFAULT_TAB } from "../route.ts";
import {
  EMPTY_FORM,
  highlightWords,
  isBlank,
  type SearchForm,
  searchArgs,
  sizeWords,
} from "../search/session-search.ts";
import type { SearchWord } from "../search/in-view-search.ts";
import { markedText } from "./search-marks.tsx";
import { navigate, searchSessions } from "../state.ts";

/** 動いていないセッションを探す。
 *
 * 一覧に出るのは instance が今見ているセッションだけなので、**終わったもの・
 * ccmsg を起動していなかったもの**はそこに居ない。それを探すのは instance の
 * 仕事で (file はその host にある)、この画面が持つのは問いと、返ってきた行。
 *
 * 行を押すとその transcript を開く。動いていないセッションでも読めるのは、
 * transcript を読む op が sid で答えるから — 生きている接続は要らない。 */

function when(at: number): string {
  return new Date(at).toLocaleString();
}

function Hit({ hit, words }: { hit: SessionSearchHit; words: readonly SearchWord[] }) {
  const where = [hit.repo, hit.ws].filter((part) => part !== undefined).join(" / ");
  // 名乗りは、そのセッションが自分で付けた題 → 場所 → id の順。id まで落ちたら
  // 頭だけにする (行の主役は当たった本文で、id は見分けが付けば足りる)。
  const label = hit.title ?? (where === "" ? hit.sid.slice(0, 8) : where);
  return (
    <div class="hit">
      <button
        type="button"
        class="name open"
        onClick={() => {
          navigate({ at: "session", sid: hit.sid, tab: DEFAULT_TAB });
        }}
      >
        {label}
      </button>
      <span class="meta">{where === "" ? (hit.cwd ?? "") : where}</span>
      <span class="meta mono">{hit.sid.slice(0, 8)}</span>
      <span class="meta">{when(hit.updated_at)}</span>
      <span class="meta">{sizeWords(hit.size)}</span>
      {hit.matches.length > 0 && (
        <div class="hit-matches">
          {hit.matches.map((match, at) => (
            // 一致は本文の抜き書きなので、markdown としては描かない (打たれた
            // 記号がそのまま見えることが、探した人の求めているもの)。
            <p key={`${String(at)} ${match.text.slice(0, 24)}`} class="hit-match">
              <span class={`hit-role role-${match.role}`}>
                {match.role === "user" ? "人" : "セッション"}
              </span>
              <span class="hit-text">{markedText(match.text, words)}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function SessionSearch() {
  const form = useSignal<SearchForm>(EMPTY_FORM);
  const result = useSignal<SessionSearchResult | undefined>(undefined);
  const problem = useSignal<string | undefined>(undefined);
  const running = useSignal(false);
  const words = useSignal<readonly SearchWord[]>([]);
  const held = form.value;

  const run = (): void => {
    if (isBlank(held) || running.value) return;
    running.value = true;
    problem.value = undefined;
    words.value = highlightWords(held);
    searchSessions(searchArgs(held))
      .then((found) => {
        result.value = found;
      })
      .catch((cause: unknown) => {
        problem.value = String(cause);
      })
      .finally(() => {
        running.value = false;
      });
  };

  const set = (part: Partial<SearchForm>): void => {
    form.value = { ...form.value, ...part };
  };

  return (
    <details class="section search-sessions">
      <summary>動いていないセッションを探す</summary>
      <form
        class="search-form"
        onSubmit={(event: Event) => {
          event.preventDefault();
          run();
        }}
      >
        <label class="search-query">
          探す言葉
          <input
            type="search"
            value={held.query}
            placeholder="空白で AND、改行で OR"
            onInput={(event) => {
              set({ query: event.currentTarget.value });
            }}
          />
        </label>
        <span class="search-toggles">
          <label>
            <input
              type="checkbox"
              checked={held.user}
              onChange={(event) => {
                set({ user: event.currentTarget.checked });
              }}
            />
            人の言葉
          </label>
          <label>
            <input
              type="checkbox"
              checked={held.agent}
              onChange={(event) => {
                set({ agent: event.currentTarget.checked });
              }}
            />
            セッションの言葉
          </label>
          <label>
            <input
              type="checkbox"
              checked={held.regex}
              onChange={(event) => {
                set({ regex: event.currentTarget.checked });
              }}
            />
            正規表現
          </label>
        </span>
        <label>
          作業場所
          <input
            type="text"
            value={held.cwd}
            placeholder="パスの一部 (空白で AND)"
            onInput={(event) => {
              set({ cwd: event.currentTarget.value });
            }}
          />
        </label>
        <label>
          セッション id
          <input
            type="text"
            value={held.sid}
            placeholder="一部でよい"
            onInput={(event) => {
              set({ sid: event.currentTarget.value });
            }}
          />
        </label>
        <label>
          いつまで遡るか
          <input
            type="text"
            value={held.within}
            placeholder="5d"
            onInput={(event) => {
              set({ within: event.currentTarget.value });
            }}
          />
        </label>
        <button type="submit" disabled={running.value || isBlank(held)}>
          {running.value ? "探しています…" : "探す"}
        </button>
      </form>
      {problem.value !== undefined && <p class="banner">{problem.value}</p>}
      {result.value !== undefined && (
        <div class="search-results">
          {result.value.hits.length === 0 ? (
            <p class="empty">見つかりませんでした。言葉を減らすか、遡る幅を広げてください。</p>
          ) : (
            result.value.hits.map((hit) => <Hit key={hit.sid} hit={hit} words={words.value} />)
          )}
          {result.value.truncated && (
            // 打ち切りは「上限に当たった」ではなく「まだあるかもしれない」と
            // 言う: 出ている行は本物だが、全部ではない。
            <p class="meta">
              途中で打ち切りました — 出ているものが全部とは限りません。言葉・作業場所・遡る幅で
              絞ると最後まで見られます。
            </p>
          )}
        </div>
      )}
    </details>
  );
}
