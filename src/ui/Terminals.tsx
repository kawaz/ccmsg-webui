import type { TerminalInfo } from "@ccmsg/protocol";
import { href } from "../base.ts";
import { DEFAULT_TAB } from "../route.ts";
import {
  terminalById,
  terminalHandle,
  terminalLabel,
  TERMINAL_SECTION_LABELS,
  type TerminalSection,
} from "../terminals.ts";
import { terminalUrl } from "../terminal-url.ts";
import { navigate, peers, runRows, terminalGateway, terminalGroups, terminals } from "../state.ts";
import { run } from "../actions/tree.ts";
import { Holder, useAction, useScope } from "./Scope.tsx";
import { TerminalFrame } from "./TerminalPanel.tsx";

/** 端末の一覧と、端末 1 つの画面。
 *
 * **端末はセッションの持ち物ではない** (契約 DR-0026)。人が `zsh -i` で開いた窓も
 * ここに出るし、セッションが終わった端末は消えるのではなくこの一覧に戻る。どの
 * セッションが居るかは pid の一致から導かれるもので、行そのものは何も知らない。 */

function when(at: number | undefined): string {
  return at === undefined ? "不明" : new Date(at).toLocaleString();
}

function go(event: MouseEvent, id: string): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
  event.preventDefault();
  navigate({ at: "terminal", id });
}

/** 端末を gateway の画面で開くリンク。新しいタブに出すのは一覧の行と同じ理由で、
 * 見ていたものを見失わずに端末を覗けるから。届かない端末には何も出さない。 */
export function OpenLink({ id, strong }: { id: string; strong?: boolean }) {
  return (
    <Holder name={`terminal ${id}`}>
      <OpenTerminal id={id} strong={strong} />
    </Holder>
  );
}

/** 行が**自分の端末を対象に**「端末を開く」を担当する (DR-0003 §2.3)。押す所は
 * リンクのままで、`onClick` はアクションを起こす 1 行になる。 */
function OpenTerminal({ id, strong }: { id: string; strong?: boolean }) {
  const scope = useScope();
  const url = terminalUrl(terminalGateway.value, id);
  useAction("terminal.open", {
    enabled: () => terminalUrl(terminalGateway.value, id) !== undefined,
    run: () => {
      const to = terminalUrl(terminalGateway.value, id);
      if (to !== undefined) window.open(to, "_blank", "noreferrer");
    },
  });
  if (url === undefined) return null;
  return (
    <a
      class={strong === true ? "terminal-link strong" : "terminal-link"}
      href={url}
      target="_blank"
      rel="noreferrer"
      title="端末を開く"
      onClick={(event: MouseEvent) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        run("terminal.open", scope);
      }}
    >
      端末
    </a>
  );
}

/** 端末 1 行。押すとこの build の端末の画面へ、`端末` は gateway の画面へ。 */
function TerminalRow({ row, strong }: { row: TerminalInfo; strong?: boolean }) {
  return (
    <div class="row">
      <a
        class="name"
        href={href({ at: "terminal", id: row.id })}
        onClick={(event: MouseEvent) => {
          go(event, row.id);
        }}
      >
        {terminalLabel(row)}
      </a>
      <span class="state">{row.state}</span>
      {row.cwd !== undefined && <span class="meta host">{row.cwd}</span>}
      <OpenLink id={row.id} strong={strong} />
      <span class="meta run-when">{when(row.started_at)}</span>
      <span class="meta mono">{terminalHandle(row.id)}</span>
    </div>
  );
}

function groupTitle(section: TerminalSection, count: number): string {
  return `${TERMINAL_SECTION_LABELS[section]} (${String(count)})`;
}

/** この host の端末ぜんぶ。 */
export function Terminals() {
  const groups = terminalGroups.value;
  return (
    <>
      {groups.length === 0 && (
        <section class="section">
          <h2>端末 (0)</h2>
          <p class="empty">
            端末管理を持っている instance が居ません (この instance では端末を数えられません)。
          </p>
        </section>
      )}
      {groups.map((group) => (
        <section class="section" key={group.section}>
          <h2>{groupTitle(group.section, group.rows.length)}</h2>
          {group.section === "starting" && (
            <p class="empty">
              ハーネスは起動しているのに、状態ファイルも挨拶もまだ届いていません。
              様子は端末の中にしかないので、開いて確かめてください。
            </p>
          )}
          <div class="rows">
            {group.rows.map((row) => (
              <TerminalRow
                key={`${row.instance} ${row.id}`}
                row={row}
                strong={group.section === "starting"}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

/** 端末 1 つ。分かっていることと、開く手と、埋められるなら中身。 */
export function Terminal({ id }: { id: string }) {
  const row = terminalById(terminals.value, id);
  if (row === undefined) return <Gone id={id} />;
  // この端末に居るセッション。端末の側から見た答えなので、run の一覧を pid で
  // 引く (契約 DR-0026 の対応表はこの向きにも読める)。
  const run = runRows.value.find((one) => one.instance === row.instance && one.pid === row.pid);
  const peer = run?.sid === undefined ? undefined : peers.value.find((o) => o.sid === run.sid);
  return (
    <section class="section terminal">
      <h2>{terminalLabel(row)}</h2>
      <dl class="run-facts">
        <dt>状態</dt>
        <dd>{row.state}</dd>
        <dt>pid</dt>
        <dd class="mono run-pid">{row.pid ?? "不明"}</dd>
        <dt>作業ディレクトリ</dt>
        <dd class="host">{row.cwd ?? "不明"}</dd>
        <dt>開始</dt>
        <dd class="run-when">{when(row.started_at)}</dd>
        <dt>セッション</dt>
        <dd>
          {peer === undefined ? (
            "この端末を使っているセッションはありません"
          ) : (
            <a
              href={href({ at: "session", sid: peer.sid, tab: DEFAULT_TAB })}
              onClick={(event: MouseEvent) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                navigate({ at: "session", sid: peer.sid, tab: DEFAULT_TAB });
              }}
            >
              {peer.title ?? peer.cwd}
            </a>
          )}
        </dd>
        <dt>端末</dt>
        <dd>
          <OpenLink id={row.id} />
        </dd>
        <dt>id</dt>
        <dd class="mono">{row.id}</dd>
      </dl>
      <TerminalFrame id={row.id} />
    </section>
  );
}

/** 名指された端末が一覧に無い時。閉じたか、その host の instance に繋がって
 * いないか — どちらも「今は無い」ので、無いと言って一覧へ返す。 */
function Gone({ id }: { id: string }) {
  const scope = useScope();
  return (
    <section class="section terminal">
      <h2>この端末はありません</h2>
      <p class="empty">
        <code>{id}</code> は、今どの instance の一覧にも居ません (閉じた端末か、その host に
        繋がっていません)。
      </p>
      <p class="run-back">
        <a
          href={href({ at: "terminals" })}
          onClick={(event: MouseEvent) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            run("app.open-terminals", scope);
          }}
        >
          端末の一覧へ
        </a>
      </p>
    </section>
  );
}
