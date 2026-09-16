import { useEffect } from "preact/hooks";
import { href } from "../base.ts";
import { navigate } from "../state.ts";
import {
  base,
  BRAND_C,
  BRAND_H,
  changed,
  choosePreset,
  discard,
  FACE_NAME,
  FACES,
  type Face,
  type InputSpec,
  inputStep,
  preset,
  PRESETS,
  resetToBase,
  revert,
  save,
  setBrandFromColor,
  setFace,
  setInput,
  SLIDERS,
  standingBrand,
  standingNumber,
  theme,
  unsaved,
} from "../theme.ts";

/** 色の見え方を選ぶ所。
 *
 * 出ているのは**層 0 の入力と face** だけで、段表は出てこない (DR-0001 §2.6)。
 * 触った結果はその場の画面に出る — この画面自身も同じ色で立っているので、見本
 * を別に用意する必要が無い。
 *
 * 触ることは**試すこと**で、覚えるのは「保存」を押した時だけ (§2.7)。離れれば
 * 試したものは消えるので、どこまで戻せるかを気にせず動かせる。
 *
 * instance には何も聞かない。だから繋がっていなくても立つ。 */

const FACE_LABELS: Readonly<Record<Face, string>> = {
  system: "OS に従う",
  light: "light",
  dark: "dark",
};

const BRAND_LABEL = "主語の色 (押せるもの・選ばれているもの)";

const LABELS: Readonly<Record<string, string>> = {
  [FACE_NAME]: "light か dark か",
  "neutral-h": "中立に混ぜる色味の色相",
  "neutral-c": "中立に混ぜる色味の強さ",
  "h-info": "知らせ (info) の色相",
  "h-success": "うまくいっている (success) の色相",
  "h-warning": "注意 (warning) の色相",
  "h-danger": "危険 (danger) の色相",
  "tag-h0": "識別の族の始まりの色相",
  "tag-step": "識別の族の色相の間隔",
};

/** その入力が今どう効いているかの見本。**算出済みの色を見せる** — 数字の 253 が
 * どの青かは、その青を出す以外に言いようが無い。 */
function Swatch({ name }: { name: string }) {
  const family = name.startsWith("h-")
    ? name.slice(2)
    : name.startsWith("brand")
      ? "brand"
      : undefined;
  const roles =
    family !== undefined
      ? [`--${family}-surface`, `--${family}-border`, `--${family}-fill`]
      : name.startsWith("tag-")
        ? ["--tag-0", "--tag-2", "--tag-4"]
        : ["--surface", "--border", "--fill"];
  return (
    <span class="theme-swatch" aria-hidden="true">
      {roles.map((role) => (
        <span key={role} style={`background:var(${role})`} />
      ))}
    </span>
  );
}

/** ベースと違う項に付く「戻す」。**押せること自体が差の印**で、行にどの印を
 * 出すかは CSS が `:has()` でこのボタンから読む — 同じことを 2 か所で判定
 * すると、片方だけ古くなる。
 *
 * 受けるのが名前の並びなのは、主語の色が 2 入力で 1 つの選択だから。 */
function Revert({ names, label, diff }: { names: readonly string[]; label: string; diff: Diff }) {
  return (
    <button
      type="button"
      class="theme-revert"
      disabled={!names.some((name) => diff.has(name))}
      aria-label={`${label}をベースに戻す`}
      onClick={() => {
        revert(names);
      }}
    >
      戻す
    </button>
  );
}

type Diff = ReadonlySet<string>;

function InputRow({ spec, diff }: { spec: InputSpec; diff: Diff }) {
  const chosen = theme.value.inputs[spec.name];
  const value = chosen ?? standingNumber(spec);
  const step = inputStep(spec);
  const label = LABELS[spec.name] ?? spec.name;
  return (
    <p class="theme-row">
      <label class="theme-label" for={`theme-${spec.name}`}>
        {label}
      </label>
      <Swatch name={spec.name} />
      <input
        id={`theme-${spec.name}`}
        type="range"
        min={0}
        max={spec.max}
        step={step}
        value={value}
        onInput={(event) => {
          setInput(spec, Number((event.currentTarget as HTMLInputElement).value));
        }}
      />
      <output class="mono theme-value" for={`theme-${spec.name}`}>
        {spec.kind === "hue" ? `${String(value)}°` : value.toFixed(3)}
      </output>
      <Revert names={[spec.name]} label={label} diff={diff} />
    </p>
  );
}

export function Settings() {
  // 離れたら試したものは消える。覚えたものは残るので、戻る先は常に 1 つ。
  useEffect(() => discard, []);

  const chosen = theme.value;
  const diff = changed(chosen, base.value);
  const from = preset.value;
  const standing: Face = chosen.face ?? "system";
  const ground = from === undefined ? "覚えてある色" : "選んだ組";
  return (
    <div class="app">
      <div class="bar app-bar">
        <a
          href={href({ at: "sessions" })}
          onClick={(event: MouseEvent) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
            event.preventDefault();
            navigate({ at: "sessions" });
          }}
        >
          ← 一覧
        </a>
        <span>色</span>
      </div>
      <section class="section theme">
        <h2>組から始める</h2>
        <p class="meta">
          選ぶとその場で画面が変わる。ここから下を触って好きに動かせる — 選んだ組が、変えた所を
          数える基準になる。
        </p>
        <fieldset class="theme-presets">
          <legend>色の組</legend>
          {PRESETS.map((one) => (
            <label key={one.id} class="theme-preset">
              <input
                type="radio"
                name="theme-preset"
                value={one.id}
                checked={from === one.id}
                onChange={() => {
                  choosePreset(one.id);
                }}
              />
              <span class="theme-preset-name">{one.label}</span>
              <span class="theme-preset-note meta">{one.note}</span>
            </label>
          ))}
        </fieldset>

        <h2>どの face で立つか</h2>
        <p class="theme-row theme-row-faces">
          <span class="theme-label">{LABELS[FACE_NAME]}</span>
          <span class="theme-faces">
            {FACES.map((face) => (
              <button
                key={face}
                type="button"
                class={standing === face ? "on" : undefined}
                aria-pressed={standing === face}
                onClick={() => {
                  setFace(face);
                }}
              >
                {FACE_LABELS[face]}
              </button>
            ))}
          </span>
          <Revert names={[FACE_NAME]} label={LABELS[FACE_NAME] ?? FACE_NAME} diff={diff} />
        </p>
        <p class="meta">選ばなければ OS の設定に従う。選ぶと、この端末ではそちらが勝つ。</p>

        <h2>色</h2>
        <p class="meta">
          ここにあるのが選べるもののぜんぶ。段の明るさは出てこない — 文字が読める ことは段の側で
          保証してあり、ここから崩せないようにしてある。
        </p>
        <p class="theme-row">
          <label class="theme-label" for="theme-brand">
            {BRAND_LABEL}
          </label>
          <Swatch name="brand" />
          <input
            id="theme-brand"
            type="color"
            value={standingBrand()}
            onInput={(event) => {
              setBrandFromColor((event.currentTarget as HTMLInputElement).value);
            }}
          />
          <output class="mono theme-value" for="theme-brand">
            {standingBrand()}
          </output>
          <Revert names={[BRAND_H.name, BRAND_C.name]} label={BRAND_LABEL} diff={diff} />
        </p>
        <p class="meta">
          効くのはその色相と色味で、明るさは段が決める — 暗い色を選んでも文字が 読めなくなること
          はない。
        </p>
        {SLIDERS.map((spec) => (
          <InputRow key={spec.name} spec={spec} diff={diff} />
        ))}

        <p class="meta">
          保存するまでは試しているだけ — この画面を離れるか読み込み直すと、覚えてある色に戻る。
        </p>
        <div class="theme-decide">
          <p class="theme-diff-count" aria-live="polite">
            {diff.size === 0 ? `${ground}のまま` : `${ground}と違うのは ${String(diff.size)} 項`}
          </p>
          <p class="theme-actions">
            <button type="button" disabled={diff.size === 0} onClick={resetToBase}>
              ベースに戻す
            </button>
            <button type="button" class="theme-save" disabled={!unsaved.value} onClick={save}>
              保存
            </button>
          </p>
        </div>
      </section>
    </div>
  );
}
