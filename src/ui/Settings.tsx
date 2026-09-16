import { href } from "../base.ts";
import { navigate } from "../state.ts";
import {
  clearBrand,
  clearInput,
  clearTheme,
  FACES,
  type Face,
  type InputSpec,
  INPUTS,
  inputStep,
  setBrand,
  setFace,
  setInput,
  standingBrand,
  standingNumber,
  theme,
} from "../theme.ts";

/** 色の見え方を選ぶ所。
 *
 * 出ているのは**層 0 の入力と face** だけで、段表は出てこない (DR-0001 §2.5)。
 * 触った結果はその場の画面に出る — この画面自身も同じ色で立っているので、見本
 * を別に用意する必要が無い。
 *
 * instance には何も聞かない。だから繋がっていなくても立つ。 */

const FACE_LABELS: Readonly<Record<Face, string>> = {
  system: "OS に従う",
  light: "light",
  dark: "dark",
};

const INPUT_LABELS: Readonly<Record<string, string>> = {
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
  const family = name.startsWith("h-") ? name.slice(2) : name === "brand" ? "brand" : undefined;
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

function InputRow({ spec }: { spec: InputSpec }) {
  const chosen = theme.value.inputs[spec.name];
  const value = chosen ?? standingNumber(spec);
  const step = inputStep(spec);
  return (
    <p class="theme-row">
      <label class="theme-label" for={`theme-${spec.name}`}>
        {INPUT_LABELS[spec.name] ?? spec.name}
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
      <button
        type="button"
        disabled={chosen === undefined}
        onClick={() => {
          clearInput(spec);
        }}
      >
        戻す
      </button>
    </p>
  );
}

export function Settings() {
  const chosen = theme.value;
  const touched =
    chosen.face !== undefined ||
    chosen.brand !== undefined ||
    INPUTS.some((spec) => chosen.inputs[spec.name] !== undefined);
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
        <h2>どの face で立つか</h2>
        <p class="theme-faces">
          {FACES.map((face) => (
            <button
              key={face}
              type="button"
              class={(chosen.face ?? "system") === face ? "on" : undefined}
              aria-pressed={(chosen.face ?? "system") === face}
              onClick={() => {
                setFace(face);
              }}
            >
              {FACE_LABELS[face]}
            </button>
          ))}
        </p>
        <p class="meta">選ばなければ OS の設定に従う。選ぶと、この端末ではそちらが勝つ。</p>

        <h2>色</h2>
        <p class="meta">
          ここにあるのが選べるもののぜんぶ。段の明るさは出てこない — 文字が読める
          ことは段の側で保証してあり、ここから崩せないようにしてある。
        </p>
        <p class="theme-row">
          <label class="theme-label" for="theme-brand">
            主語の色 (押せるもの・選ばれているもの)
          </label>
          <Swatch name="brand" />
          <input
            id="theme-brand"
            type="color"
            value={standingBrand()}
            onInput={(event) => {
              setBrand((event.currentTarget as HTMLInputElement).value);
            }}
          />
          <output class="mono theme-value" for="theme-brand">
            {standingBrand()}
          </output>
          <button type="button" disabled={chosen.brand === undefined} onClick={clearBrand}>
            戻す
          </button>
        </p>
        <p class="meta">
          効くのはその色相と色味で、明るさは段が決める — 暗い色を選んでも文字が
          読めなくなることはない。
        </p>
        {INPUTS.map((spec) => (
          <InputRow key={spec.name} spec={spec} />
        ))}

        <p>
          <button type="button" disabled={!touched} onClick={clearTheme}>
            ぜんぶ既定に戻す
          </button>
        </p>
      </section>
    </div>
  );
}
