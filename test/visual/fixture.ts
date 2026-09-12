import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** What the screens are shown reading.
 *
 * Written down rather than recorded from a real session, because a baseline is
 * only worth comparing against if the page draws the same thing twice: every
 * instant here is a fixed one, every path is this run's own, and the prose is
 * chosen to reach the parts of the renderer the screenshots are for — a
 * Markdown heading, a list, a table, a fenced block that Shiki highlights, a
 * tool call that folds, and a stretch of thinking. */

export const SID = "11111111-2222-4333-8444-555555555555";
export const OTHER_SID = "66666666-7777-4888-8999-aaaaaaaaaaaa";
/** 呼び出しと答えが頁の境をまたぐ transcript。これも fixture が先に書く —
 * 境界の位置は行の数で決まるので、test が書き足して instance の取り込みを待つ
 * 形にすると、境界がどこに落ちたかまで取り込みの速さに乗ってしまう。 */
export const JOIN_SID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
/** 答えの後ろに積む行。頁 (200) の 2 つ分に 1 行足りない数にすると、答えは
 * 遡り読みの頁の先頭に、呼び出しはその 1 つ手前の頁の末尾に落ちる。 */
export const JOIN_AFTER = 399;
/** その呼び出しを名指す鍵と、答えが持っている文。 */
export const JOIN_KEY = "toolu_join_01";
export const JOIN_SAID = "頁をまたいで結んだ結果です。";

/** 頁をまたいで遡る test が読むセッション。
 *
 * 長さは fixture が**先に**書く (daemon が起動して読む前に file がある)。test が
 * 走ってから 500 行を書き足す形だと、見ているのは「遡れるか」ではなく「instance
 * が書き足しの束をどれだけ速く取り込むか」になり、遅い機械では取り込みが追い
 * つかないまま assert に着く。追記が届くことは `TAIL_SID` の側が見る。 */
export const BULK_SID = "99999999-aaaa-4bbb-8ccc-dddddddddddd";
/** 頁 (200) をまたぐ長さ。3 頁目で先頭まで届く。 */
export const BULK_ITEMS = 500;
/** 追記が届くことを見る test が読むセッション。誰も書き足さない小さな
 * transcript を持つ — 数で確かめるものなので、他の test が同じ file を伸ばすと
 * 起点が動く。 */
export const TAIL_SID = "88888888-9999-4aaa-8bbb-cccccccccccc";
/** 状態の画面が読むセッション。道具の呼びしか持たない transcript で、絵に出る
 * のは instance がそれを畳んだ結果。 */
export const STATUS_SID = "77777777-8888-4999-8aaa-bbbbbbbbbbbb";
/** The worker the session starts, which the agent screen reads as its subject.
 * Spelled the way the harness spells one, because the instance checks the shape
 * before it opens a file by that name. */
export const AGENT_ID = "a471372f2";

const AT = "2026-03-01T04:05:06.000Z";

/** Every record carries the id the harness gives it, and the ids are written
 * down rather than generated: an item is named `<record>:<n>`, that name is on
 * the page in a fold's key and a search hit's, and a fresh id per run would
 * make a baseline compare against a different name every time. */
let written = 0;

function line(row: Record<string, unknown>): string {
  written += 1;
  return `${JSON.stringify({ uuid: `rec-${String(written).padStart(2, "0")}`, ...row })}\n`;
}

function user(text: string): string {
  return line({ type: "user", timestamp: AT, message: { role: "user", content: text } });
}

function assistant(content: readonly unknown[], at: string = AT): string {
  return line({ type: "assistant", timestamp: at, message: { role: "assistant", content } });
}

const PROSE = `## 畳んだ値の読み方

topic frame は **instance ごとのスロット**に畳まれ、読む側は 1 つの形だけを読みます。

- \`whole\` は topic に 1 つ
- \`per_instance_whole\` は instance に 1 つ
- \`append\` は列に畳めないので窓で持つ

| topic | 粒度 | 窓 |
|---|---|---|
| \`peers\` | whole | なし |
| \`transcript\` | append | 末尾 1 MiB |

\`\`\`ts
export function union<T>(slots: ReadonlyMap<string, T>): readonly T[] {
  return [...slots.values()];
}
\`\`\`

詳しくは [DESIGN-ja.md](./docs/DESIGN-ja.md) を読んでください。`;

/** The transcript the Timeline screens read. */
function transcript(): string {
  return [
    user("この instance の topic の畳み方を、表と一緒に説明して。"),
    assistant([
      {
        type: "thinking",
        thinking:
          "読み手が要るのは粒度の対応表と、append だけが窓になる理由。\n表を先に出して、その後に理由を 1 段落で足す。",
      },
      { type: "text", text: PROSE },
    ]),
    assistant([
      {
        type: "tool_use",
        id: "tu_read_design",
        name: "Read",
        input: { file_path: "docs/DESIGN-ja.md", limit: 40 },
      },
    ]),
    line({
      type: "user",
      timestamp: AT,
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tu_read_design",
            content:
              "     1\t# ccmsg-webui 設計\n     2\t\n     3\t## ドメイン\n     4\t\n     5\tこのリポジトリが持つのは契約の読み手 1 つ。",
          },
        ],
      },
    }),
    // 分類の甘い所も画面に出る、を写す 2 つ: 誰も field を書いていない道具と、
    // 読み手が置けなかった record。どちらも型名と持ち物で出て、元の行への入口が
    // 既定で見える。
    assistant([
      {
        type: "tool_use",
        id: "tu_mystery",
        name: "MysteryTool",
        input: { knob: 3, mode: "そのまま" },
      },
    ]),
    line({ type: "なにか", timestamp: AT, note: "読み手が置けなかった行" }),
    // worker への依頼と、返ってきた答え。親に残るのはこの 2 行だけで、worker が
    // 何を叩いたかは worker 自身の transcript にしか無い — その入口が画面に出る。
    assistant([
      {
        type: "tool_use",
        id: "tu_agent",
        name: "Agent",
        input: {
          name: "fold-scout",
          subagent_type: "Explore",
          description: "畳み方の実装を読む",
          prompt: "topic-fold.ts の畳み方を読んで、窓を持つ topic を挙げて。",
        },
      },
    ]),
    line({
      type: "user",
      timestamp: AT,
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tu_agent",
            content: "窓を持つのは append だけでした。",
          },
        ],
      },
      toolUseResult: { agentId: AGENT_ID, status: "ok" },
    }),
    assistant([
      {
        type: "text",
        text: "表の通りで、`append` だけが窓を持ちます。窓は 2 方向から埋まるので、穴は繋がっているふりをせず拒否します。",
      },
    ]),
  ].join("");
}

const CODE = `/** 畳んだ値の和。instance をまたいで足すのはここだけ。 */
export function union<T>(slots: ReadonlyMap<string, T>): readonly T[] {
  return [...slots.values()];
}

export function isFoldable(topic: string): boolean {
  return topic !== "element";
}
`;

const NOTES = `# 読み方のメモ

- **購読が先、読み込みが後**
- 窓は末尾 1 MiB まで
- 落ちた行は \`transcript.read\` が答える範囲そのもの

\`\`\`sh
just visual
\`\`\`
`;

/** The worker's own transcript: the brief it was given, what it thought, what
 * it ran, and the answer it returned. Every line is its own, which is the whole
 * point of reading it as a subject. */
function agentTranscript(): string {
  return [
    user("topic-fold.ts の畳み方を読んで、窓を持つ topic を挙げて。"),
    assistant([{ type: "thinking", thinking: "まず isFoldable を読んで、粒度ごとの分岐を見る。" }]),
    assistant([
      {
        type: "tool_use",
        id: "tu_agent_grep",
        name: "Grep",
        input: { pattern: "granularity", path: "src" },
      },
    ]),
    line({
      type: "user",
      timestamp: AT,
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "tu_agent_grep", content: "3 hits" }],
      },
      toolUseResult: { numFiles: 1, numLines: 3 },
    }),
    assistant([
      {
        type: "tool_use",
        id: "tu_agent_read",
        name: "Read",
        input: { file_path: "src/topic-fold.ts", limit: 40 },
      },
    ]),
    line({
      type: "user",
      timestamp: AT,
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tu_agent_read",
            content: "     1\texport function isFoldable",
          },
        ],
      },
    }),
    assistant([{ type: "text", text: "窓を持つのは `append` だけでした。" }]),
  ].join("");
}

/** 翻訳の基準が読む英文。思考と返事の 2 つで、段落は 2 つ — 段落ごとに訳が
 * 届くことと、段落の境が保たれることの両方が 1 枚に写る。 */
const ENGLISH_THINKING = `The fold is read from the contract rather than from a table written here, so a topic that changes granularity changes one place.

What is left to decide is the window: only an appending topic has one, and its bounds are the same bytes the reader pages by.`;

const ENGLISH_REPLY = `Only \`append\` carries a window, and it is filled from both ends.

A hole refuses to pretend it is joined, which is what keeps a partial read from reading as a whole one.`;

/** 狭い画面の基準が読む transcript。
 *
 * SID のものと分けてあるのは、あちらが**書き足される**から (追記が届くこと・
 * 遡れることを見る test が同じ file を伸ばす)。狭い画面の絵は「何 item あるか」
 * まで写すので、誰も足さない file の上に置く。
 *
 * 中身は幅を決めるもの — 表、コード、長い 1 行 — と、頁 (200) をまたぐだけの
 * 長さ。遡って頁が足された後に幅が崩れるので、1 頁では足りない。 */
function phoneTranscript(): string {
  const rows = [user("この instance の topic の畳み方を、表と一緒に説明して。")];
  for (let n = 0; n < 260; n += 1) {
    rows.push(assistant([{ type: "text", text: `頁をまたぐための行 ${String(n)}` }]));
  }
  rows.push(assistant([{ type: "text", text: PROSE }]));
  // 英語の思考と返事を 1 つずつ。翻訳の基準はここを訳す — 日本語の段落は
  // そもそも訳しに回らないので、日本語だけの transcript では経路が動かない。
  rows.push(
    assistant([
      {
        type: "thinking",
        thinking: ENGLISH_THINKING,
      },
      { type: "text", text: ENGLISH_REPLY },
    ]),
  );
  // 遡り切った先頭に幅を決めるものが来るよう、長い方を後ろに積む。
  // 先頭に「幅を決めるもの」と「英語の本文」を置く: どちらも遡り切った所で
  // 撮るので、間に詰め物を挟まない。
  const first = rows[0] as string;
  const prose = rows.at(-2) as string;
  const english = rows.at(-1) as string;
  return [first, prose, english, ...rows.slice(1, -2)].join("");
}

/** 状態の画面が読むもの。
 *
 * instance が transcript から畳むので、ここに書くのは**道具の呼びと答え**だけ
 * — 状態そのものは書かない。畳み方は instance の側にあり、この画面はその答えを
 * 描くだけなので、fixture も道具の記録から始まらないと本物の道を通らない。 */
function statusTranscript(): string {
  // ここだけ「今」から書く。走っているものの経過時間が画面に出るので、固定の
  // 時刻で書くと「4675 時間 走っている workflow」になる。分単位に丸めるのは
  // 本物の今から離さないため (絵の側は経過の桁を覆うので、値そのものは基準に
  // 写らない)。
  const recent = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 5 * 60_000).toISOString();
  const call = (id: string, name: string, input: Record<string, unknown>): string =>
    assistant([{ type: "tool_use", id, name, input }], recent);
  const answer = (id: string, result: unknown): string =>
    line({
      type: "user",
      timestamp: recent,
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: id, content: "ok" }],
      },
      toolUseResult: result,
    });
  return [
    line({
      type: "user",
      timestamp: recent,
      message: { role: "user", content: "束 0 を片付けて。" },
    }),
    call("tu_todo_1", "TaskCreate", { taskId: "t1", subject: "Status タブの中身を出す" }),
    answer("tu_todo_1", { task: { id: "t1", subject: "Status タブの中身を出す" } }),
    call("tu_todo_2", "TaskCreate", { taskId: "t2", subject: "基準画像を撮り直す" }),
    answer("tu_todo_2", { task: { id: "t2", subject: "基準画像を撮り直す" } }),
    call("tu_todo_3", "TaskUpdate", { taskId: "t1", status: "in_progress" }),
    answer("tu_todo_3", { task: { id: "t1" } }),
    call("tu_todo_4", "TaskCreate", { taskId: "t3", subject: "翻訳の入口を item に置く" }),
    answer("tu_todo_4", { task: { id: "t3", subject: "翻訳の入口を item に置く" } }),
    call("tu_todo_5", "TaskUpdate", { taskId: "t3", status: "completed" }),
    answer("tu_todo_5", { task: { id: "t3" } }),
    call("tu_flow", "Workflow", { name: "束 0", script: "bundle.ts" }),
    answer("tu_flow", { taskId: "wf1", workflowName: "束 0 を片付ける", status: "async_launched" }),
    call("tu_monitor", "Monitor", { description: "just watch の結果を見張る" }),
    answer("tu_monitor", { taskId: "bg1" }),
    call("tu_bash", "Bash", { description: "visual を回す", run_in_background: true }),
    answer("tu_bash", { backgroundTaskId: "bg2" }),
  ].join("");
}

export interface Fixture {
  readonly transcriptPath: string;
  /** 状態の画面が読む方 (STATUS_SID)。 */
  readonly statusTranscriptPath: string;
  /** 追記を見る test が読む方 (TAIL_SID)。 */
  readonly tailTranscriptPath: string;
  /** 頁をまたいで遡る test が読む方 (BULK_SID)。 */
  readonly bulkTranscriptPath: string;
  /** 呼び出しと答えが頁の境をまたぐ方 (JOIN_SID)。 */
  readonly joinTranscriptPath: string;
  /** 狭い画面の基準が読む方 (OTHER_SID)。 */
  readonly phoneTranscriptPath: string;
}

/** Lay the fixture down under this run's config home and working directory. */
export function writeFixture(home: string, cwd: string): Fixture {
  const project = join(home, "projects", "-visual-repo");
  mkdirSync(project, { recursive: true });
  const transcriptPath = join(project, `${SID}.jsonl`);
  writeFileSync(transcriptPath, transcript());
  const joinTranscriptPath = join(project, `${JOIN_SID}.jsonl`);
  writeFileSync(
    joinTranscriptPath,
    [
      user("道具を 1 つ呼んで。"),
      assistant([{ type: "tool_use", id: JOIN_KEY, name: "Bash", input: { command: "echo 鍵" } }]),
      line({
        type: "user",
        timestamp: AT,
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: JOIN_KEY }] },
        toolUseResult: { stdout: JOIN_SAID },
      }),
      ...Array.from({ length: JOIN_AFTER }, (_unused, n) =>
        assistant([{ type: "text", text: `join after ${String(n)}` }]),
      ),
    ].join(""),
  );
  const bulkTranscriptPath = join(project, `${BULK_SID}.jsonl`);
  writeFileSync(
    bulkTranscriptPath,
    [
      user("長い transcript を遡りたい。"),
      ...Array.from({ length: BULK_ITEMS }, (_unused, n) =>
        assistant([{ type: "text", text: `bulk ${String(n)}` }]),
      ),
    ].join(""),
  );
  const tailTranscriptPath = join(project, `${TAIL_SID}.jsonl`);
  writeFileSync(
    tailTranscriptPath,
    [
      user("追記が届くか確かめたい。"),
      assistant([{ type: "text", text: "書かれた分はそのまま末尾に出ます。" }]),
    ].join(""),
  );
  const statusTranscriptPath = join(project, `${STATUS_SID}.jsonl`);
  writeFileSync(statusTranscriptPath, statusTranscript());
  const phoneTranscriptPath = join(project, `${OTHER_SID}.jsonl`);
  writeFileSync(phoneTranscriptPath, phoneTranscript());
  const agents = join(project, SID, "subagents");
  mkdirSync(agents, { recursive: true });
  writeFileSync(join(agents, `agent-${AGENT_ID}.jsonl`), agentTranscript());

  mkdirSync(join(cwd, "src"), { recursive: true });
  writeFileSync(join(cwd, "src", "topic-fold.ts"), CODE);
  writeFileSync(join(cwd, "NOTES.md"), NOTES);
  return {
    transcriptPath,
    phoneTranscriptPath,
    statusTranscriptPath,
    tailTranscriptPath,
    bulkTranscriptPath,
    joinTranscriptPath,
  };
}
