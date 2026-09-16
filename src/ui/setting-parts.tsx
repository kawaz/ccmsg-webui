import type { ComponentChildren } from "preact";
import type { SectionFace } from "../settings-section.ts";

/** 設定の画面を組み立てる部品のうち、**section を問わない**もの。
 *
 * 出てくるのは「ベースと違う項に印を付けて戻せること」と「試した結果を覚える
 * かどうかを決めること」で、どちらも何が入力かを知らない (DR-0002)。section が
 * 持ち込むのは入力そのものの描き方だけ。 */

/** ベースと違う項に付く「戻す」。**押せること自体が差の印**で、行にどの印を
 * 出すかは CSS が `:has()` でこのボタンから読む — 同じことを 2 か所で判定
 * すると、片方だけ古くなる。
 *
 * 受けるのが名前の並びなのは、1 つの操作が複数の入力を動かすことがあるから
 * (色の主語の色がそれ — カラーピッカー 1 つで色相と色味の 2 入力が動く)。
 * 戻す単位は**画面に出ている操作の単位**に揃える。 */
export function SettingRevert({ store, names }: { store: SectionFace; names: readonly string[] }) {
  const diff = store.diff.value;
  return (
    <button
      type="button"
      class="theme-revert"
      disabled={!names.some((name) => diff.has(name))}
      aria-label={`${store.wordFor(names[0] ?? "")}をベースに戻す`}
      onClick={() => {
        store.revert(names);
      }}
    >
      戻す
    </button>
  );
}

/** 1 つの入力の行。左に名前、右端に「戻す」、その間に section が置くもの。 */
export function SettingRow({
  store,
  names,
  label,
  labelFor,
  children,
}: {
  store: SectionFace;
  /** この行が動かす入力の名前。差の印と「戻す」がこれで決まる。 */
  names: readonly string[];
  label: string;
  /** 行の名前が指す入力の id。押して入力へ飛べるようにする。 */
  labelFor?: string;
  children: ComponentChildren;
}) {
  return (
    <p class="theme-row">
      {labelFor === undefined ? (
        <span class="theme-label">{label}</span>
      ) : (
        <label class="theme-label" for={labelFor}>
          {label}
        </label>
      )}
      {children}
      <SettingRevert store={store} names={names} />
    </p>
  );
}

/** 名前付きの組。互いに排他なので radio で、囲いは `fieldset` が既に持って
 * いる — 見出しと選択肢の結び付きを class で作り直さない。 */
export function SettingPresets({ store }: { store: SectionFace }) {
  const chosen = store.preset.value;
  return (
    <fieldset class="theme-presets">
      <legend>{store.title}の組</legend>
      {store.presets.map((one) => (
        <label key={one.id} class="theme-preset">
          <input
            type="radio"
            name={`preset-${store.id}`}
            value={one.id}
            checked={chosen === one.id}
            onChange={() => {
              store.choose(one.id);
            }}
          />
          <span class="theme-preset-name">{one.label}</span>
          {one.note !== undefined && <span class="theme-preset-note meta">{one.note}</span>}
        </label>
      ))}
    </fieldset>
  );
}

/** 決める所。**触っている間ずっと見えている** — 差の数も「保存」も、動かして
 * いる最中に知りたいことなので、下端に貼り付ける。 */
export function SettingDecide({ store }: { store: SectionFace }) {
  const diff = store.diff.value;
  const ground = store.preset.value === undefined ? "覚えてあるもの" : "選んだ組";
  return (
    <div class="theme-decide">
      <p class="theme-diff-count" aria-live="polite">
        {diff.size === 0 ? `${ground}のまま` : `${ground}と違うのは ${String(diff.size)} 項`}
      </p>
      <p class="theme-actions">
        <button
          type="button"
          disabled={diff.size === 0}
          onClick={() => {
            store.resetToBase();
          }}
        >
          ベースに戻す
        </button>
        <button
          type="button"
          class="theme-save"
          disabled={!store.unsaved.value}
          onClick={() => {
            store.save();
          }}
        >
          保存
        </button>
      </p>
    </div>
  );
}
