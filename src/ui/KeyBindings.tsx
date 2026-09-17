import { useSignal } from "@preact/signals";
import {
  checkBinding,
  displayBinding,
  isFailure,
  type Modifier,
  parseBinding,
  type Platform,
  platformNow,
} from "../actions/binding.ts";
import { ACTIONS } from "../actions/catalogue.ts";
import {
  bindingOf,
  type KeyEntry,
  keys,
  rebind,
  spellsFor,
  unknownActions,
} from "../actions/keys.ts";
import { SettingRow } from "./setting-parts.tsx";

/** キーバインドの設定 (DR-0003 §2.5)。
 *
 * 並ぶのは**アクションの一覧**で、綴りの一覧ではない — 人が探すのは「これを
 * 打鍵でやりたい」であって「この打鍵は何だったか」ではない。id と題はアクション
 * の側から出るので、アクションを足した時にこの画面へ手は要らない。
 *
 * 入力欄には**綴りをそのまま**置き、隣に今の platform での姿を添える (§2.5)。
 * 記号だけでは設定に転記できず、綴りだけでは実際にどのキーかが分からない。
 * そして添えた解決結果が、`CmdOrCtrl` が論理和ではなく**置き換え**であることを
 * 目に見せる。 */

const PLATFORM_WORDS: Readonly<Record<Platform, string>> = {
  mac: "mac",
  other: "mac 以外",
};

/** 打鍵をそのまま綴りにする。修飾キー単体は綴りにならない (それだけでは
 * 打鍵ではない)。 */
function spellFromEvent(event: KeyboardEvent): string | undefined {
  if (/^(Meta|Control|Alt|Shift)(Left|Right)$/.test(event.code)) return undefined;
  const modifiers: Modifier[] = [
    ...(event.metaKey ? (["Cmd"] as const) : []),
    ...(event.ctrlKey ? (["Ctrl"] as const) : []),
    ...(event.altKey ? (["Alt"] as const) : []),
    ...(event.shiftKey ? (["Shift"] as const) : []),
  ];
  return [...modifiers, event.code].join("+");
}

/** その綴りについて人に言うこと。**断るのではなく、何が起きるかを先に言う**。 */
function Verdict({ spell, entry }: { spell: string; entry: KeyEntry }) {
  const platform = platformNow();
  const read = parseBinding(spell);
  if (isFailure(read)) return <span class="key-bad">{read.problem}</span>;
  const binding = bindingOf(spell, entry);
  if (binding === undefined) return null;
  if (entry.only !== undefined && entry.only !== platform) {
    return <span class="meta">{PLATFORM_WORDS[entry.only]} だけの割り当てです</span>;
  }
  const verdict = checkBinding(binding, platform);
  if (verdict.at === "reserved") {
    // 予約は断らない。設定はできるが効かないので、**効かないことを表示する** —
    // 割り当てたのに何も起きない時、それが書き間違いなのかブラウザの仕業なのか
    // は、画面に出ていなければ人には分からない。
    return (
      <span class="key-reserved">
        ブラウザがこの打鍵をページに渡しません。設定はできますが効きません。
      </span>
    );
  }
  if (verdict.at === "warned") {
    return (
      <span class={entry.force === true ? "meta" : "key-warned"}>
        {verdict.lost}を奪います。
        {entry.force === true ? "承知で通しています。" : "通すには「承知で通す」を入れてください。"}
      </span>
    );
  }
  return <span class="key-shown">{displayBinding(binding, platform)}</span>;
}

function BindingRow({ action, title }: { action: string; title: string }) {
  const draft = keys.draft.value;
  const spells = spellsFor(draft, action);
  const spell = spells[0] ?? "";
  const entry: KeyEntry = (spell === "" ? undefined : draft[spell]) ?? { action };
  const catching = useSignal(false);

  const set = (next: string, part?: Partial<KeyEntry>): void => {
    keys.edit(rebind(draft, spell === "" ? undefined : spell, next, { ...entry, ...part, action }));
  };

  return (
    <SettingRow store={keys} names={spells.length === 0 ? [action] : spells} label={title}>
      <input
        type="text"
        class="key-spell mono"
        value={spell}
        aria-label={`${title} の打鍵`}
        placeholder="CmdOrCtrl+Shift+KeyK"
        onInput={(event) => {
          set(event.currentTarget.value.trim());
        }}
      />
      <button
        type="button"
        class={catching.value ? "on" : undefined}
        aria-pressed={catching.value}
        title="次に押した打鍵を綴りにする"
        onClick={() => {
          catching.value = !catching.value;
        }}
        onKeyDown={(event: KeyboardEvent) => {
          if (!catching.value) return;
          // 受け取っている間は、押した打鍵がボタンを押し直す手にはならない。
          event.preventDefault();
          const next = spellFromEvent(event);
          if (next === undefined) return;
          catching.value = false;
          set(next);
        }}
      >
        打鍵から
      </button>
      <select
        class="key-only"
        aria-label={`${title} を有効にする platform`}
        value={entry.only ?? ""}
        disabled={spell === ""}
        onChange={(event) => {
          const picked = event.currentTarget.value;
          const next: KeyEntry = {
            action,
            ...(entry.force === true ? { force: true as const } : {}),
            ...(picked === "mac" || picked === "other" ? { only: picked } : {}),
          };
          keys.edit(rebind(draft, spell, spell, next));
        }}
      >
        <option value="">どの platform でも</option>
        {(["mac", "other"] as const).map((one) => (
          <option key={one} value={one}>
            {PLATFORM_WORDS[one]} だけ
          </option>
        ))}
      </select>
      <label class="key-force">
        <input
          type="checkbox"
          checked={entry.force === true}
          disabled={spell === ""}
          onChange={(event) => {
            const on = event.currentTarget.checked;
            const next: KeyEntry = {
              action,
              ...(entry.only === undefined ? {} : { only: entry.only }),
              ...(on ? { force: true as const } : {}),
            };
            keys.edit(rebind(draft, spell, spell, next));
          }}
        />
        承知で通す
      </label>
      {spell !== "" && <Verdict spell={spell} entry={entry} />}
    </SettingRow>
  );
}

export function KeyBindings() {
  const stale = unknownActions(keys.draft.value);
  return (
    <div class="key-rows">
      <p class="meta">
        入力欄には綴りをそのまま置き、隣に今の環境での姿を出します。`CmdOrCtrl` は今の platform
        の主要な修飾子 1 つに解決します (mac なら ⌘、それ以外は Ctrl) —
        両方で発火するわけではありません。
      </p>
      {ACTIONS.map((one) => (
        <BindingRow key={one.id} action={one.id} title={one.title} />
      ))}
      {stale.length > 0 && (
        <p class="meta">
          この画面が知らないアクションに結ばれた行があります (
          {stale.map((id) => (
            <code key={id}>{id}</code>
          ))}
          )。その行が効かないだけで、他には何もしません。
        </p>
      )}
    </div>
  );
}
