import {
  ADVANCED,
  BRAND_C,
  BRAND_H,
  colour,
  FACE_NAME,
  FACES,
  type Face,
  IDENTITY,
  type InputSpec,
  inputStep,
  setBrandFromColor,
  setFace,
  setInput,
  standingBrand,
  standingNumber,
  theme,
  wordFor,
} from "../theme.ts";
import { SettingRow } from "./setting-parts.tsx";

/** 色 section の入力。
 *
 * 出ているのは**層 0 の入力と face** だけで、段表は出てこない (DR-0001 §2.6)。
 * 触った結果はその場の画面に出る — この画面自身も同じ色で立っているので、見本
 * を別に用意する必要が無い。
 *
 * 差の印・「戻す」・組・保存はこの file に無い。section を問わない部品
 * (`setting-parts.tsx`) が持っていて、ここが足すのは入力そのものだけ。 */

const FACE_LABELS: Readonly<Record<Face, string>> = {
  system: "OS に従う",
  light: "light",
  dark: "dark",
};

/** その入力が今どう効いているかの見本。**算出済みの色を見せる** — 数字の 253 が
 * どの青かは、その青を出す以外に言いようが無い。 */
function Swatch({ name }: { name: string }) {
  // 誰かの色は段が 3 つとも同じ色相から出ているので、見本もその 3 段を並べる。
  if (name === "h-main" || name === "h-user") {
    return (
      <span class="theme-swatch member" aria-hidden="true" style={`--member-h:var(--${name})`}>
        {["--member-surface-subtle", "--member-surface", "--member-border"].map((role) => (
          <span key={role} style={`background:var(${role})`} />
        ))}
      </span>
    );
  }
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

function SliderRow({ spec }: { spec: InputSpec }) {
  const chosen = theme.value.inputs[spec.name];
  const value = chosen ?? standingNumber(spec);
  const id = `theme-${spec.name}`;
  return (
    <SettingRow store={colour} names={[spec.name]} label={wordFor(spec.name)} labelFor={id}>
      <Swatch name={spec.name} />
      <input
        id={id}
        type="range"
        min={0}
        max={spec.max}
        step={inputStep(spec)}
        value={value}
        onInput={(event) => {
          setInput(spec, Number((event.currentTarget as HTMLInputElement).value));
        }}
      />
      <output class="mono theme-value" for={id}>
        {spec.kind === "hue" ? `${String(value)}°` : value.toFixed(3)}
      </output>
    </SettingRow>
  );
}

export function ColourInputs() {
  const standing: Face = theme.value.face ?? "system";
  return (
    <>
      <SettingRow store={colour} names={[FACE_NAME]} label={wordFor(FACE_NAME)}>
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
      </SettingRow>
      <p class="meta">選ばなければ OS の設定に従う。選ぶと、この端末ではそちらが勝つ。</p>

      <SettingRow
        store={colour}
        names={[BRAND_H.name, BRAND_C.name]}
        label={wordFor(BRAND_H.name)}
        labelFor="theme-brand"
      >
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
      </SettingRow>
      <p class="meta">
        効くのはその色相と色味で、明るさは段が決める — 暗い色を選んでも文字が読めなくなることは
        ない。
      </p>

      {IDENTITY.map((spec) => (
        <SliderRow key={spec.name} spec={spec} />
      ))}
      <p class="meta">
        誰が言ったかは色相で言う。この 2
        人以外の相手の色相は、ここで選んだ色と意味色を避けて配られる。
      </p>

      <details class="theme-advanced">
        <summary>詳細</summary>
        <p class="meta">残りの入力。触らなければ、上で選んだ色相から既定のまま導かれる。</p>
        {ADVANCED.map((spec) => (
          <SliderRow key={spec.name} spec={spec} />
        ))}
      </details>
    </>
  );
}
