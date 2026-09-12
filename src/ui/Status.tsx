import type {
  SessionBackgroundStatus,
  SessionStatusSnapshot,
  SessionTodo,
  SessionWorkflowStatus,
} from "@ccmsg/protocol";
import { sessionStatus, status } from "../state.ts";

/** セッションが**今何をしているか**。
 *
 * 端末の Claude Code が画面の下に出しているもの (走っている workflow、背後の
 * 仕事、TODO) と同じ問いに答える: 動いているのか、それとも何かを待って止まって
 * いるのか。どれも instance が transcript から畳んだもので、この画面は畳み直さ
 * ない — 同じ transcript を読む他の画面と違う答えを出さないため。 */

/** 走っているものを先に、終わったものを後に。読む理由が違う — 走っているものは
 * 「今どうなっているか」、終わったものは「何があったか」。 */
function running(state: string): boolean {
  return state === "running" || state === "in_progress" || state === "pending";
}

function when(at: number | undefined): string {
  return at === undefined ? "" : new Date(at).toLocaleTimeString();
}

/** 経った時間。走っているものは「いつ始まったか」より「どれだけ経ったか」の方が
 * 読む理由に近い。 */
function elapsed(from: number, to: number | undefined, now: number): string {
  const ms = Math.max(0, (to ?? now) - from);
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return `${String(Math.floor(ms / 1000))} 秒`;
  if (minutes < 60) return `${String(minutes)} 分`;
  return `${String(Math.floor(minutes / 60))} 時間 ${String(minutes % 60)} 分`;
}

function TodoRow({ todo }: { todo: SessionTodo }) {
  return (
    <div class={`status-item state-${running(todo.status) ? "on" : "done"}`}>
      <span class="status-state">{todo.status}</span>
      <span class="status-subject">{todo.subject}</span>
      {todo.owner !== undefined && <span class="meta">{todo.owner}</span>}
      {todo.blocked_by.length > 0 && (
        <span class="meta" title={todo.blocked_by.join(", ")}>
          {todo.blocked_by.length} 件待ち
        </span>
      )}
    </div>
  );
}

function WorkflowRow({ flow, now }: { flow: SessionWorkflowStatus; now: number }) {
  const done = flow.phases.reduce((sum, phase) => sum + phase.done, 0);
  const total = flow.phases.reduce((sum, phase) => sum + phase.total, 0);
  return (
    <div class={`status-item state-${running(flow.status) ? "on" : "done"}`}>
      <span class="status-state">{flow.status}</span>
      <span class="status-subject">{flow.name}</span>
      {total > 0 && (
        <span class="meta">
          {done} / {total} phase
        </span>
      )}
      {flow.agents.length > 0 && <span class="meta">{flow.agents.length} agent</span>}
      <span class="meta">{elapsed(flow.started_at, flow.ended_at, now)}</span>
    </div>
  );
}

const KIND_LABELS: Readonly<Record<SessionBackgroundStatus["kind"], string>> = {
  monitor: "監視",
  bash: "コマンド",
  agent: "worker",
};

function BackgroundRow({ task, now }: { task: SessionBackgroundStatus; now: number }) {
  return (
    <div class={`status-item state-${running(task.status) ? "on" : "done"}`}>
      <span class="status-state">{task.status}</span>
      <span class="status-kind">{KIND_LABELS[task.kind]}</span>
      <span class="status-subject">
        {task.description === "" ? task.task_id : task.description}
      </span>
      <span class="meta">{elapsed(task.started_at, task.ended_at, now)}</span>
    </div>
  );
}

/** 走っているものを上に。同じ組の中では新しい方が上 — 古い完了は下に沈む。 */
function byRunning<T>(rows: readonly T[], live: (row: T) => boolean, at: (row: T) => number): T[] {
  return [...rows].sort((a, b) => {
    if (live(a) !== live(b)) return live(a) ? -1 : 1;
    return at(b) - at(a);
  });
}

function Section({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: preact.ComponentChildren;
}) {
  return (
    <div class="status-block">
      <h3>
        {title}
        <span class="meta">{count}</span>
      </h3>
      {count === 0 ? <p class="empty">{empty}</p> : children}
    </div>
  );
}

export function Status() {
  const held: SessionStatusSnapshot | undefined = sessionStatus.value;
  const now = Date.now();
  if (status.value !== "open") {
    return (
      <section class="section">
        <h2>状態</h2>
        <p class="empty">instance に繋いでいません。</p>
      </section>
    );
  }
  if (held === undefined) {
    return (
      <section class="section">
        <h2>状態</h2>
        <p class="empty">instance が読んでいます…</p>
      </section>
    );
  }
  const todos = byRunning(
    held.todos,
    (todo) => running(todo.status),
    () => 0,
  );
  const flows = byRunning(
    held.workflows,
    (flow) => running(flow.status),
    (flow) => flow.started_at,
  );
  const tasks = byRunning(
    held.background,
    (task) => running(task.status),
    (task) => task.started_at,
  );
  const doneTodos = held.todos.filter((todo) => !running(todo.status)).length;

  return (
    <section class="section status">
      <h2>状態</h2>
      {held.api_error !== undefined && (
        // 止まっている理由。他のどれよりも先に出す — 一覧に何も走っていない時、
        // 「暇だから」と「ここで止まっているから」は別のことで、読む人が次に
        // 何をするかが変わる。
        <p class="banner">
          <b>このセッションは止まっています</b> ({when(held.api_error.occurred_at)})
          <br />
          {held.api_error.text}
        </p>
      )}
      {held.context !== undefined && (
        <p class="meta">
          直近の turn が読んだ量: {held.context.tokens.toLocaleString()} token /{" "}
          {held.context.model}
          {held.context.effort !== undefined && ` (${held.context.effort})`}
        </p>
      )}
      <Section title="workflow" count={flows.length} empty="走った workflow はありません。">
        {flows.map((flow) => (
          <WorkflowRow key={flow.task_id} flow={flow} now={now} />
        ))}
      </Section>
      <Section title="背後の仕事" count={tasks.length} empty="背後で走っているものはありません。">
        {tasks.map((task) => (
          <BackgroundRow key={task.task_id} task={task} now={now} />
        ))}
      </Section>
      <Section title="TODO" count={todos.length} empty="このセッションは TODO を持っていません。">
        <>
          {todos.map((todo) => (
            <TodoRow key={todo.id} todo={todo} />
          ))}
          {doneTodos > 0 && <p class="meta">{doneTodos} 件が終わっています。</p>}
        </>
      </Section>
    </section>
  );
}
