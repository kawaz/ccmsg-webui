import type { ComponentType } from "preact";
import { useEffect } from "preact/hooks";
import { href } from "../base.ts";
import type { SectionFace } from "../settings-section.ts";
import { navigate } from "../state.ts";
import { colour } from "../theme.ts";
import { ColourInputs } from "./ColourInputs.tsx";
import { ColourPreview } from "./ColourPreview.tsx";
import { SettingDecide, SettingPresets } from "./setting-parts.tsx";

/** 設定の画面。
 *
 * 持っているのは **section の一覧**で、今は色 1 つ (DR-0002)。section が増える
 * 時にここが受け取るのは 1 行で、組・差の印・「戻す」・保存は section を問わ
 * ない部品が既に持っている。
 *
 * この画面は instance に何も聞かない。だから繋がっていなくても、サインインして
 * いなくても立つ (DR-0001 §2.6)。
 *
 * 触ることは**試すこと**で、覚えるのは「保存」を押した時だけ (§2.7)。離れれば
 * 試したものは消えるので、どこまで戻せるかを気にせず動かせる。 */

interface Listed {
  readonly store: SectionFace;
  readonly note: string;
  readonly Inputs: ComponentType;
  /** 選んだものが効いている所。**選ぶことと見ることは同じ 1 つの操作**なので、
   * section が持つのは入力だけではない (DR-0002 §2.7)。持たない section も
   * ありうる — 効き先が画面に出ないもの (既定の起動先など) がそれ。 */
  readonly Preview?: ComponentType;
}

/** 今ある section。足す時に触るのはこの並びと、その section の定義と入力。 */
const SECTIONS: readonly Listed[] = [
  {
    store: colour,
    note: "ここにあるのが選べるもののぜんぶ。段の明るさは出てこない — 文字が読めることは段の側で保証してあり、ここから崩せないようにしてある。",
    Inputs: ColourInputs,
    Preview: ColourPreview,
  },
];

function SectionPanel({ store, note, Inputs, Preview }: Listed) {
  return (
    <section class="section theme">
      <h2>{store.title}</h2>
      <p class="meta">{note}</p>
      {/* 入力と表示例は横に並ぶ。狭い所では縦に積み、表示例が先に来ることは
          ない — 触る所が画面の下に落ちると、見ながら動かすことができない。 */}
      <div class="theme-panes">
        <div class="theme-inputs">
          <SettingPresets store={store} />
          <Inputs />
          <p class="meta">
            保存するまでは試しているだけ — この画面を離れるか読み込み直すと、覚えてあるものに戻る。
          </p>
        </div>
        {Preview !== undefined && <Preview />}
      </div>
      <SettingDecide store={store} />
    </section>
  );
}

export function Settings() {
  // 離れたら試したものは消える。覚えたものは残るので、戻る先は常に 1 つ。
  useEffect(
    () => () => {
      for (const one of SECTIONS) one.store.discard();
    },
    [],
  );

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
        <span>設定</span>
      </div>
      {SECTIONS.map((one) => (
        <SectionPanel key={one.store.id} {...one} />
      ))}
    </div>
  );
}
