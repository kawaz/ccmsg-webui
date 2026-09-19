import { useSignal } from "@preact/signals";
import type { ConnectionStatus } from "../connection.ts";
import { connect, endpoint, setEndpoint, status, statusDetail } from "../state.ts";
import { Reload } from "./Reload.tsx";
import { Act, useAction } from "./Scope.tsx";

/** 接続前の主役 (DR-0004 §2.4、DR-0003 §2.2)。
 *
 * 住所を述べることと繋ぐことをまとめて担う。**接続後は帯として存在しない** —
 * 住所はフッタに極小で出て、接続状態は小部品になる (`GlobalNav`)。設定も
 * アカウントも使用量もここには無い: 繋ぐ前の画面に「繋ぐ」以外の道を増やすと、
 * 増やした分だけ人がどれを押すか考えることになる (§2.5)。 */

/** 押している最中の題。
 *
 * **この画面に状態の印は置かない** (DR-0004 §2.4) — トップで取りうる状態は
 * 「まだ繋いでいない」しかなく、印が 1 つの値しか取らないなら、出ていることが
 * 何も言わない。繋ぎに行っている間だけは何かが起きているので、それは**押した
 * ボタンそのもの**が題で言う (押せない間の語がそのまま今の状態になる)。 */
const BUSY: Partial<Record<ConnectionStatus, string>> = {
  connecting: "接続中…",
  greeting: "hello 送信中…",
  open: "接続済み",
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
 * 押す所は 1 つ (「接続」) で、降りる手 (「切断」) は接続後の画面にしか無い —
 * 繋がっていない画面に置いても、降りる先が無い。何が起きているかは押した
 * ボタンの題が言うので、状態の印も語も別に置かない。 */
export function ConnectionBar() {
  const busy = BUSY[status.value];
  // 押せるかどうかは**アクションの「できるか」と同じ所から出る** (DR-0003
  // §2.4) — 住所がまだ無いなら繋ぎに行く先が無く、もう繋ぎに行っている間は
  // もう一度頼むことが無い。
  useAction("app.connect", {
    enabled: () => endpoint.value !== undefined && BUSY[status.value] === undefined,
    run: () => {
      void connect();
    },
  });
  return (
    <div class="bar app-bar">
      <EndpointField />
      <Act action="app.connect">{busy ?? "接続"}</Act>
      <Reload />
      {statusDetail.value !== undefined && <span class="meta">{statusDetail.value}</span>}
    </div>
  );
}
