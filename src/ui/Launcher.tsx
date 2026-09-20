import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type {
  DirTreeEntry,
  LauncherConfigReadResult,
  LauncherRunResult,
  LauncherTemplate,
} from "@ccmsg/protocol";
import { dirTreeRows, graftDirTree } from "../files/dir-tree.ts";
import {
  can,
  launcherOpen,
  readDirTree,
  readLauncherConfig,
  runLauncher,
  status,
} from "../state.ts";

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

/** 始める場所を木から選ぶ。
 *
 * 根は config が決めていて、その下をどこまで歩くかも instance が決める
 * (`depth` を送らない = config の深さ)。歩みが止まった節は開いた時に 1 段だけ
 * 聞き直す — 深い木を全部もらってから描くと、根の下が大きい人ほど何も出ない
 * 時間が長くなる。
 *
 * 絞り込みも instance に任せる (契約 `dir.tree` の `filter` は、当たった節と
 * その先祖を残す)。押すまで走らせないのは、打つたびに木を作り直させないため。 */
function DirPicker({
  roots,
  chosen,
  onPick,
}: {
  roots: readonly string[];
  chosen: string;
  onPick: (path: string) => void;
}) {
  const entries = useSignal<readonly DirTreeEntry[] | undefined>(undefined);
  const expanded = useSignal<ReadonlySet<string>>(new Set<string>());
  const typed = useSignal("");
  const applied = useSignal("");
  const problem = useSignal<string | undefined>(undefined);

  useEffect(() => {
    if (roots.length === 0) return;
    let live = true;
    const filter = applied.value;
    // **根ごとに 1 回聞く**。`dir.tree` が答えるのは根の**下**なので、根を
    // まとめて聞くと、どの根の下だったかが失われて 2 本の木が 1 本に混ざる。
    // 根そのものも始められる場所なので、聞いた答えを根の下に置いて木にする。
    Promise.all(
      roots.map(async (root) => {
        const read = await readDirTree({ roots: [root], ...(filter === "" ? {} : { filter }) });
        return { path: root, children: [...read.entries] };
      }),
    )
      .then((read) => {
        if (!live) return;
        // 絞った時は、当たった所まで開いた姿で出す。閉じたままだと、当たった
        // 節が先祖の下に隠れて「絞ったのに何も出ない」と見える。
        const kept = filter === "" ? read : read.filter((one) => one.children.length > 0);
        entries.value = kept;
        expanded.value =
          filter === "" ? new Set<string>() : new Set(allPaths(kept, new Set<string>()));
      })
      .catch((cause: unknown) => {
        if (live) problem.value = String(cause);
      });
    return () => {
      live = false;
    };
  }, [roots, applied.value, entries, expanded, problem]);

  const held = entries.value;
  const toggle = (path: string): void => {
    const next = new Set(expanded.value);
    if (next.has(path)) {
      next.delete(path);
      expanded.value = next;
      return;
    }
    next.add(path);
    expanded.value = next;
    // まだ下を聞いていない節だけ聞きに行く。1 段ずつなのは、開いた先を見て
    // から次を決めるのが人の動きだから。
    if (held === undefined || hasChildren(held, path)) return;
    readDirTree({ roots: [path], depth: 1 })
      .then((read) => {
        if (entries.value !== undefined) {
          entries.value = graftDirTree(entries.value, path, read.entries);
        }
      })
      .catch((cause: unknown) => {
        problem.value = String(cause);
      });
  };

  return (
    <div class="launch-tree">
      <span class="launch-filter">
        <input
          type="search"
          value={typed.value}
          aria-label="場所を名前で絞る"
          placeholder="名前で絞る"
          onInput={(event) => {
            typed.value = event.currentTarget.value;
          }}
          onKeyDown={(event) => {
            // 絞るための Enter で走り出さない。この欄の Enter は「絞る」を
            // 押すのと同じ意味で、外側の form の submit ではない。
            if (event.key !== "Enter") return;
            event.preventDefault();
            applied.value = typed.value.trim();
          }}
        />
        <button
          type="button"
          aria-label="場所を絞る"
          onClick={() => {
            applied.value = typed.value.trim();
          }}
        >
          絞る
        </button>
      </span>
      {problem.value !== undefined && <p class="banner">{problem.value}</p>}
      {held === undefined ? (
        <p class="empty">場所を読んでいます…</p>
      ) : held.length === 0 ? (
        <p class="empty">当たる場所がありません。</p>
      ) : (
        <ul class="launch-dirs">
          {dirTreeRows(held, expanded.value).map((row) => (
            <li key={row.path} style={`--launch-depth:${String(row.depth)}`}>
              {row.expandable ? (
                <button
                  type="button"
                  class="launch-caret"
                  aria-expanded={row.expanded}
                  aria-label={`${row.label} の下`}
                  onClick={() => {
                    toggle(row.path);
                  }}
                >
                  {row.expanded ? "▾" : "▸"}
                </button>
              ) : (
                <span class="launch-caret" aria-hidden="true">
                  ・
                </span>
              )}
              <button
                type="button"
                class={chosen === row.path ? "on" : undefined}
                onClick={() => {
                  onPick(row.path);
                }}
              >
                {row.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 木に出ている path を全部。絞った答えを開いた形で出すためだけに要る。 */
function allPaths(entries: readonly DirTreeEntry[], acc: Set<string>): Set<string> {
  for (const entry of entries) {
    acc.add(entry.path);
    if (entry.children !== undefined) allPaths(entry.children, acc);
  }
  return acc;
}

/** その節の下を既に聞いてあるか。 */
function hasChildren(entries: readonly DirTreeEntry[], path: string): boolean {
  for (const entry of entries) {
    if (entry.path === path) return entry.children !== undefined;
    if (entry.children !== undefined && hasChildren(entry.children, path)) return true;
  }
  return false;
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
    <details
      class="section launcher"
      open={launcherOpen.value}
      onToggle={(event) => {
        launcherOpen.value = (event.currentTarget as HTMLDetailsElement).open;
      }}
    >
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
            <DirPicker
              roots={held.root_dirs}
              chosen={cwd.value}
              onPick={(path) => {
                cwd.value = path;
              }}
            />
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
