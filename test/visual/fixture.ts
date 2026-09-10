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

function assistant(content: readonly unknown[]): string {
  return line({ type: "assistant", timestamp: AT, message: { role: "assistant", content } });
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
- 落ちた行は \`transcript_read\` が答える範囲そのもの

\`\`\`sh
just visual
\`\`\`
`;

export interface Fixture {
  readonly transcriptPath: string;
}

/** Lay the fixture down under this run's config home and working directory. */
export function writeFixture(home: string, cwd: string): Fixture {
  const project = join(home, "projects", "-visual-repo");
  mkdirSync(project, { recursive: true });
  const transcriptPath = join(project, `${SID}.jsonl`);
  writeFileSync(transcriptPath, transcript());

  mkdirSync(join(cwd, "src"), { recursive: true });
  writeFileSync(join(cwd, "src", "topic-fold.ts"), CODE);
  writeFileSync(join(cwd, "NOTES.md"), NOTES);
  return { transcriptPath };
}
