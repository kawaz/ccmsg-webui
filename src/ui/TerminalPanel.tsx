import { useState } from "preact/hooks";
import type { Sid } from "@ccmsg/protocol";
import { terminalEmbedUrl } from "../terminal-url.ts";
import { terminalGateway, terminalIds } from "../state.ts";

/** セッションが動いている端末そのもの。描画も入力も gateway 側の embed ページ
 * が持ち、この画面は iframe を置くだけ — 端末の実装をこちら側に持たない。
 *
 * 端末に届かない状態 (gateway が無い / セッションが端末を名乗らない) では
 * タブ自体が出ないので、通常ここには URL がある状態でしか来ない。届かなく
 * なった後に古いリンクで開かれた時だけ、その旨だけを出す。 */
export function TerminalPanel({ sid }: { sid: Sid }) {
  const url = terminalEmbedUrl(terminalGateway.value, terminalIds.value.get(sid));
  // iframe は中身が描画されるまで UA 既定の白で塗られる (dark で一瞬眩しい)。
  // load までは透明にして親の背景を見せ、load 後に出す。
  const [loaded, setLoaded] = useState(false);
  if (url === null) {
    return (
      <section class="section">
        <h2>端末</h2>
        <p class="empty">
          <code>{sid}</code> の端末は今この instance から開けません。
        </p>
      </section>
    );
  }
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
