import { useSignal } from "@preact/signals";
import type { ConnectionStatus } from "../connection.ts";
import { connect, endpoint, setEndpoint, status, statusDetail } from "../state.ts";
import { Reload } from "./Reload.tsx";

/** 接続前の主役 (DR-0004 §2.4、DR-0003 §2.2)。
 *
 * 住所を述べることと繋ぐことをまとめて担う。**接続後は帯として存在しない** —
 * 住所はフッタに極小で出て、接続状態は小部品になる (`GlobalNav`)。設定も
 * アカウントも使用量もここには無い: 繋ぐ前の画面に「繋ぐ」以外の道を増やすと、
 * 増やした分だけ人がどれを押すか考えることになる (§2.5)。 */

/** socket が今していることを言う語。
 *
 * まだ何も始めていない時 (`idle`) だけ語が無い — ドットが灰のままであることが
 * それで、隣に「未接続」と書くのは同じことを 2 度言っている。何かをしている
 * 間は、ドットの色だけでは何をしているかまでは言えないので語が要る。 */
const WORDS: Partial<Record<ConnectionStatus, string>> = {
  connecting: "接続中",
  greeting: "hello 送信中",
  open: "接続済み",
  closed: "切断",
};

/** どの instance に繋ぐか。
 *
 * この画面はどこに publish されていてもよく、繋ぐ先はそれとは別の site で
 * ありうる (契約 DR-0030)。だから住所は**人が述べるもの**で、既定で入って
 * いるのはこのページ自身の住所 — instance が UI ごと配っている置き方では
 * それが正しく、それ以外では出発点にすぎない。
 *
 * 書き換えは離れた時 (or Enter) に確定する。1 文字ごとに確定すると、打って
 * いる途中の URL に繋ぎ変えることになる。受け取れない綴りは**打った文字を
 * 残したまま**断る — 直す相手が消えたら、何を直せばいいのか分からない。 */
function EndpointField() {
  const at = endpoint.value;
  const draft = useSignal<string | undefined>(undefined);
  const refused = useSignal(false);
  const shown = draft.value ?? at ?? "";
  const commit = (): void => {
    const next = draft.value?.trim();
    if (next === undefined || next === at) {
      draft.value = undefined;
      return;
    }
    if (!setEndpoint(next)) {
      refused.value = true;
      draft.value = next;
      return;
    }
    refused.value = false;
    draft.value = undefined;
  };
  return (
    <input
      type="url"
      class="endpoint mono"
      value={shown}
      aria-invalid={refused.value ? "true" : undefined}
      aria-label="instance の endpoint"
      placeholder="https://host/path/"
      title={refused.value ? "末尾が / の http(s) の base URL を入れてください" : undefined}
      onInput={(event) => {
        draft.value = event.currentTarget.value;
        refused.value = false;
      }}
      onBlur={commit}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key === "Enter") (event.currentTarget as HTMLInputElement).blur();
      }}
    />
  );
}

/** 住所と、繋ぐこと。
 *
 * 押す所は 1 つ (「接続」) で、切断は接続後の画面にしか無い — 繋がっていない
 * 画面に切断を置いても押すものが無い。認証の画面が立っている間は語を出さない:
 * 何が起きているかはその画面の本文が言っていて、ここが重ねて言うことは無い。 */
export function ConnectionBar({ words = true }: { words?: boolean }) {
  const state = status.value;
  const said = words ? WORDS[state] : undefined;
  return (
    <div class="bar app-bar">
      <span class={`dot ${state === "open" ? "open" : state === "closed" ? "closed" : ""}`} />
      {said !== undefined && <span>{said}</span>}
      <EndpointField />
      <button
        type="button"
        disabled={endpoint.value === undefined}
        onClick={() => {
          void connect();
        }}
      >
        接続
      </button>
      <Reload />
      {statusDetail.value !== undefined && <span class="meta">{statusDetail.value}</span>}
    </div>
  );
}
