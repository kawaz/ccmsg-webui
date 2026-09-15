import { useState } from "preact/hooks";
import type { Sid, TerminalInfo } from "@ccmsg/protocol";
import { href } from "../base.ts";
import { terminalLabel } from "../terminals.ts";
import { terminalEmbedUrl } from "../terminal-url.ts";
import { navigate, terminalGateway, terminalIds, terminalsOfSession } from "../state.ts";

/** セッションが動いている端末そのもの。描画も入力も gateway 側の embed ページ
 * が持ち、この画面は iframe を置くだけ — 端末の実装をこちら側に持たない。
 *
 * どの端末かは**セッションから導く** (`terminalsOf`、契約 DR-0026): 端末の一覧と
 * run の一覧を pid で突き合わせた答えで、run が消えればここは空になり、端末は
 * 一覧の側に戻る。端末管理を持たない instance では端末の一覧がそもそも無いので、
 * run が状態ファイルから知っている `terminal_id` に落ちる (契約 §2)。 */

/** 1 つの端末を埋める枠。埋める先は gateway の embed ページで、そこへ届かない
 * 時 (gateway が無い / 別の scheme の端末) は何も描かない — 空の iframe は
 * 「端末が黙っている」と見分けが付かない。 */
export function TerminalFrame({ id }: { id: string | undefined }) {
  const url = terminalEmbedUrl(terminalGateway.value, id);
  // iframe は中身が描画されるまで UA 既定の白で塗られる (dark で一瞬眩しい)。
  // load までは透明にして親の背景を見せ、load 後に出す。
  const [loaded, setLoaded] = useState(false);
  if (url === undefined) return null;
  return (
    <div class="terminal-pane">
      <iframe
        class={loaded ? "terminal-iframe" : "terminal-iframe loading"}
        onLoad={() => {
          setLoaded(true);
        }}
        src={url}
        title="端末"
        // 端末の入力ハンドラ・送信フォームと、端末に出てきた URL を新しいタブで
        // 開くこと (allow-popups) までを許し、それ以上は渡さない。
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}

/** セッションの配下に並ぶ端末たち。1 つなら名前も出さずに埋め、2 つ以上ある時
 * だけどれを見ているかを選ばせる — 1 つしかない選択肢は選択ではない。 */
function BelowSession({ rows }: { rows: readonly TerminalInfo[] }) {
  const first = rows[0];
  if (first === undefined) return null;
  if (rows.length === 1) return <TerminalFrame id={first.id} />;
  return (
    <>
      <nav class="tabs" aria-label="このセッションの端末">
        {rows.map((row) => (
          <a
            key={row.id}
            href={href({ at: "terminal", id: row.id })}
            onClick={(event: MouseEvent) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
              event.preventDefault();
              navigate({ at: "terminal", id: row.id });
            }}
          >
            {terminalLabel(row)}
          </a>
        ))}
      </nav>
      <TerminalFrame id={first.id} />
    </>
  );
}

export function TerminalPanel({ sid }: { sid: Sid }) {
  const rows = terminalsOfSession(sid);
  // 端末管理を持たない instance では一覧が空なので、run が状態ファイルから
  // 知っている値に落ちる (契約 DR-0026 §2: 一覧がある時は pid の一致が優先)。
  const stated = terminalIds.value.get(sid);
  if (rows.length === 0 && stated === undefined) {
    return (
      <section class="section">
        <h2>端末</h2>
        <p class="empty">
          <code>{sid}</code> が動いている端末は、今この instance から見えません。
        </p>
      </section>
    );
  }
  if (rows.length === 0) return <TerminalFrame id={stated} />;
  return <BelowSession rows={rows} />;
}
