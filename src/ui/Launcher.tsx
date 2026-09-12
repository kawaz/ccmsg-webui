import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type {
  LauncherConfigReadResult,
  LauncherRunResult,
  LauncherTemplate,
} from "@ccmsg/protocol";
import { can, readLauncherConfig, runLauncher, status } from "../state.ts";

/** セッションを 1 つ始める。
 *
 * 献立 (どこで・どの手順で・どの値で) は instance が持っていて、この画面は
 * **聞いた通りに入力欄を並べるだけ**。手順の名前も変数の名前も config を書いた
 * 人の言葉で、こちらで言い換えない — 名前を知っているのはその人であって、
 * 画面ではない。
 *
 * 始めた後は追いかけない。返ってくるのは走らせた結果 (出力と終了の仕方) だけで、
 * 立ち上がったセッションは自分で名乗って一覧に出る。プロセスを見張る画面は
 * 持たない。 */

/** 値が複数行なら、複数行で書ける欄にする。プロンプトのような長い既定値を
 * 1 行の欄に押し込むと、書き換える気が失せる。 */
function rowsFor(value: string): number {
  const lines = value.split("\n").length;
  return Math.min(12, Math.max(2, lines));
}

function Result({ result }: { result: LauncherRunResult }) {
  const ended =
    result.exit_code === undefined
      ? "信号で終わりました"
      : result.exit_code === 0
        ? "終了コード 0"
        : `終了コード ${String(result.exit_code)}`;
  return (
    <div class="launch-result">
      <p class={result.timed_out || result.exit_code !== 0 ? "banner" : "meta"}>
        {result.timed_out ? "時間切れで止めました" : ended}
      </p>
      {result.stdout !== "" && <pre class="launch-out">{result.stdout}</pre>}
      {result.stderr !== "" && <pre class="launch-out launch-err">{result.stderr}</pre>}
    </div>
  );
}

export function Launcher() {
  const config = useSignal<LauncherConfigReadResult | undefined>(undefined);
  const problem = useSignal<string | undefined>(undefined);
  const chosen = useSignal<string | undefined>(undefined);
  const params = useSignal<Record<string, string>>({});
  const command = useSignal<string>("");
  const cwd = useSignal<string>("");
  const running = useSignal(false);
  const result = useSignal<LauncherRunResult | undefined>(undefined);
  const open = status.value === "open";
  const offered = can("launcher");

  /** 選んだ手順に合わせて、欄を既定値へ戻す。手順ごとに変数が違うので、
   * 前の手順に書いた値を持ち越すと、名前の合わない値が残る。 */
  const adopt = (template: LauncherTemplate, roots: readonly string[]): void => {
    chosen.value = template.name;
    command.value = template.command;
    params.value = Object.fromEntries(template.params.map((one) => [one.name, one.default]));
    if (cwd.value === "") cwd.value = roots[0] ?? "";
  };

  useEffect(() => {
    if (!open || !offered || config.value !== undefined) return;
    let live = true;
    readLauncherConfig()
      .then((read) => {
        if (!live) return;
        config.value = read;
        const first = read.templates[0];
        if (first !== undefined) adopt(first, read.root_dirs);
      })
      .catch((cause: unknown) => {
        if (live) problem.value = String(cause);
      });
    return () => {
      live = false;
    };
  });

  if (!offered) return null;
  const held = config.value;

  const start = (): void => {
    if (running.value || cwd.value.trim() === "") return;
    running.value = true;
    result.value = undefined;
    problem.value = undefined;
    runLauncher({
      cwd: cwd.value.trim(),
      params: params.value,
      ...(chosen.value === undefined ? {} : { template: chosen.value }),
      // 手順の command を書き換えて走らせるのは、端末で打つのと同じこと。
      // 書き換えていなければ送らない (instance が持っている手順がそのまま走る)。
      ...(held?.templates.find((one) => one.name === chosen.value)?.command === command.value
        ? {}
        : { command: command.value }),
    })
      .then((said) => {
        result.value = said;
      })
      .catch((cause: unknown) => {
        problem.value = String(cause);
      })
      .finally(() => {
        running.value = false;
      });
  };

  return (
    <details class="section launcher">
      <summary>セッションを始める</summary>
      {problem.value !== undefined && <p class="banner">{problem.value}</p>}
      {held === undefined ? (
        <p class="empty">献立を読んでいます…</p>
      ) : (
        <form
          class="launch-form"
          onSubmit={(event: Event) => {
            event.preventDefault();
            start();
          }}
        >
          {held.templates.length > 1 && (
            <label>
              手順
              <select
                value={chosen.value}
                onChange={(event) => {
                  const picked = held.templates.find(
                    (one) => one.name === event.currentTarget.value,
                  );
                  if (picked !== undefined) adopt(picked, held.root_dirs);
                }}
              >
                {held.templates.map((one) => (
                  <option key={one.name} value={one.name}>
                    {one.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label class="launch-cwd">
            始める場所
            <span class="launch-roots">
              {held.root_dirs.map((root) => (
                <button
                  key={root}
                  type="button"
                  class={cwd.value === root ? "on" : undefined}
                  onClick={() => {
                    cwd.value = root;
                  }}
                >
                  {root}
                </button>
              ))}
            </span>
            <input
              type="text"
              value={cwd.value}
              onInput={(event) => {
                cwd.value = event.currentTarget.value;
              }}
            />
          </label>
          {(held.templates.find((one) => one.name === chosen.value)?.params ?? []).map((param) => (
            <label key={param.name} class="launch-param">
              {param.name}
              {param.default.includes("\n") ? (
                <textarea
                  rows={rowsFor(params.value[param.name] ?? "")}
                  value={params.value[param.name] ?? ""}
                  onInput={(event) => {
                    params.value = { ...params.value, [param.name]: event.currentTarget.value };
                  }}
                />
              ) : (
                <input
                  type="text"
                  value={params.value[param.name] ?? ""}
                  onInput={(event) => {
                    params.value = { ...params.value, [param.name]: event.currentTarget.value };
                  }}
                />
              )}
            </label>
          ))}
          <label class="launch-command">
            <span>
              手順の中身
              <button
                type="button"
                onClick={() => {
                  command.value =
                    held.templates.find((one) => one.name === chosen.value)?.command ?? "";
                }}
              >
                既定に戻す
              </button>
            </span>
            <textarea
              rows={rowsFor(command.value)}
              value={command.value}
              onInput={(event) => {
                command.value = event.currentTarget.value;
              }}
            />
          </label>
          <button type="submit" disabled={running.value || cwd.value.trim() === ""}>
            {running.value ? "走らせています…" : "始める"}
          </button>
        </form>
      )}
      {result.value !== undefined && <Result result={result.value} />}
    </details>
  );
}
