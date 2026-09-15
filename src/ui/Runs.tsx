import { useSignal } from "@preact/signals";
import type { PeerInfo, SessionRun, Sid } from "@ccmsg/protocol";
import { href } from "../base.ts";
import { DEFAULT_TAB } from "../route.ts";
import { sessionLabel, SESSION_STANDING_LABELS } from "../sessions.ts";
import { killSession, navigate, peers, terminalGateway, waitingForRuns } from "../state.ts";
import { describeRefusal } from "../refusal.ts";
import { terminalUrl } from "../terminal-url.ts";

/** セッションではなく **その 1 プロセス** を見ている画面たち。
 *
 * 同じセッションを 2 つのプロセスが書いている間、instance は畳みを止め、送る
 * ことも書き出すことも断る (契約 DR-0001)。そこで人がやることは 1 つ —
 * **どちらを終わらせるかを決める** — なので、この画面が出すのはその判断に要る
 * ものと、選んだ run を終わらせる手だけにする。転送も下書きも出さない: 出せば
 * 断られるだけで、断られたことを読ませるのは判断の邪魔になる。 */

function when(at: number | undefined): string {
  return at === undefined ? "不明" : new Date(at).toLocaleString();
}

function runOf(sid: Sid): PeerInfo | undefined {
  return peers.value.find((one) => one.sid === sid);
}

/** 1 つの run について分かっていること。**どれを終わらせるかを決める材料**なので、
 * 分からないものは「不明」と言う (黙って空けると、見ていないのか無いのかが
 * 区別できない)。 */
function RunFacts({ run }: { run: SessionRun }) {
  const url = terminalUrl(terminalGateway.value, run.terminal_id);
  const waitingFor = run.pid === undefined ? undefined : waitingForRuns.value.get(run.pid);
  return (
    <dl class="run-facts">
      <dt>pid</dt>
      <dd class="mono run-pid">{run.pid === undefined ? "不明" : run.pid}</dd>
      <dt>起動</dt>
      <dd class="run-when">{when(run.started_at)}</dd>
      <dt>接続</dt>
      <dd>{run.connected ? "この instance に繋がっている" : "繋がっていない"}</dd>
      <dt>端末</dt>
      <dd>
        {url === undefined ? (
          "開けない"
        ) : (
          <a class="terminal-link" href={url} target="_blank" rel="noreferrer">
            端末
          </a>
        )}
      </dd>
      {waitingFor !== undefined && (
        <>
          <dt>答え待ち</dt>
          <dd>{waitingFor}</dd>
        </>
      )}
    </dl>
  );
}

/** この run を終わらせる。一覧の行と同じ 2 度押しで、**pid を名指して**頼む —
 * run が 2 つある間、sid だけでは instance がどちらか決められない (契約)。 */
function KillRun({ sid, run }: { sid: Sid; run: SessionRun }) {
  const asked = useSignal<"none" | "sure" | "force">("none");
  const problem = useSignal<string | undefined>(undefined);
  if (run.pid === undefined) {
    return <p class="empty">pid が分からない run なので、ここからは終われません。</p>;
  }
  const pid = run.pid;
  const kill = (force: boolean): void => {
    killSession(sid, force, pid)
      .then((said) => {
        asked.value = said.terminated ? "none" : "force";
      })
      .catch((cause: unknown) => {
        asked.value = "none";
        problem.value = describeRefusal(cause);
      });
  };
  return (
    <p class="run-actions">
      {asked.value === "none" && (
        <button
          type="button"
          onClick={() => {
            asked.value = "sure";
          }}
        >
          この run を終了
        </button>
      )}
      {asked.value === "sure" && (
        <button
          type="button"
          class="row-danger"
          onClick={() => {
            kill(false);
          }}
        >
          本当に終了 (pid {pid})
        </button>
      )}
      {asked.value === "force" && (
        <button
          type="button"
          class="row-danger"
          title="普通に頼んでも消えなかった。強い方は transcript を書き切る機会を奪う"
          onClick={() => {
            kill(true);
          }}
        >
          消えない — 強制終了
        </button>
      )}
      {problem.value !== undefined && <span class="error">{problem.value}</span>}
    </p>
  );
}

function runHref(sid: Sid, pid: number): string {
  return href({ at: "session", sid, pid, tab: DEFAULT_TAB });
}

/** どの run を見るかを選ぶ画面。2 つ以上ある時にしか出ない。 */
export function RunChoice({ sid }: { sid: Sid }) {
  const peer = runOf(sid);
  if (peer === undefined) return <Gone sid={sid} />;
  return (
    <section class="section runs">
      <h2>{sessionLabel(peer)} を 2 つのプロセスが書いています</h2>
      <p class="empty">
        どちらが正しいかは instance には決められません (どちらも同じ transcript
        を書いているので、記録も信用できません)。
        材料を見て、終わらせる方を選んでください。選ぶまで、送る・書き出す・ファイルを読むは断られます。
      </p>
      {peer.runs.map((run) => (
        <div class="run" key={run.pid ?? "unknown"}>
          {run.pid === undefined ? (
            <span class="name">pid の分からない run</span>
          ) : (
            <a
              class="name"
              href={runHref(sid, run.pid)}
              onClick={(event: MouseEvent) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                navigate({ at: "session", sid, pid: run.pid, tab: DEFAULT_TAB });
              }}
            >
              この run を見る
            </a>
          )}
          <RunFacts run={run} />
        </div>
      ))}
    </section>
  );
}

/** 1 つの run だけを見ている画面 (制限モード)。 */
export function RunPanel({ sid, run }: { sid: Sid; run: SessionRun }) {
  const peer = runOf(sid);
  if (peer === undefined) return <Gone sid={sid} />;
  const standing = SESSION_STANDING_LABELS[peer.session_status];
  return (
    <section class="section runs">
      <h2>
        {sessionLabel(peer)} の run (pid <span class="mono run-pid">{run.pid ?? "不明"}</span>)
      </h2>
      {peer.session_status === "frozen" && (
        <p class="empty">
          この instance は状態の畳みを止めています。ここに出ているのは
          <strong>止める前に信じられた最後の値</strong>で、今のものではありません。
        </p>
      )}
      {standing !== undefined && peer.session_status !== "frozen" && (
        <p class="empty">状態の畳み: {standing}</p>
      )}
      <div class="run">
        <RunFacts run={run} />
        <KillRun sid={sid} run={run} />
      </div>
      <p class="run-back">
        <a href={href({ at: "session", sid, tab: DEFAULT_TAB })}>ほかの run も見る</a>
      </p>
    </section>
  );
}

/** 名指された run がもう無い時。pid は OS が使い回すので、「同じ番号の別の
 * プロセス」を指さないよう、無いものは無いと言って session へ戻す。 */
export function RunEnded({ sid, pid }: { sid: Sid; pid: number }) {
  return (
    <section class="section runs">
      <h2>この run は終了しました</h2>
      <p class="empty">
        pid <span class="mono run-pid">{pid}</span> はこのセッションの run ではありません。
      </p>
      <p class="run-back">
        <a href={href({ at: "session", sid, tab: DEFAULT_TAB })}>セッションを見る</a>
      </p>
    </section>
  );
}

/** run が 1 つしか無いのに run を名指した URL で来た時。制限する理由がもう
 * 無いので、普通の画面へ案内する。 */
export function RunSettled({ sid, pid }: { sid: Sid; pid: number }) {
  return (
    <section class="section runs">
      <h2>走っているのはこの run だけです</h2>
      <p class="empty">
        pid <span class="mono run-pid">{pid}</span> のほかにこのセッションを書いているものは
        ありません。読むのも送るのも、セッションの画面でできます。
      </p>
      <p class="run-back">
        <a href={href({ at: "session", sid, tab: DEFAULT_TAB })}>セッションを見る</a>
      </p>
    </section>
  );
}

function Gone({ sid }: { sid: Sid }) {
  return (
    <section class="section runs">
      <h2>このセッションの行がありません</h2>
      <p class="empty">
        <code>{sid}</code> を知っている instance に繋がっていません。
      </p>
    </section>
  );
}
