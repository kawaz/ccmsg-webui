import type { ComponentType } from "preact";
import { useEffect } from "preact/hooks";
import type { SectionFace } from "../settings-section.ts";
import { keys } from "../actions/keys.ts";
import { signOutKeep } from "../signout-keep.ts";
import { colour } from "../theme.ts";
import { ColourInputs } from "./ColourInputs.tsx";
import { KeyBindings } from "./KeyBindings.tsx";
import { ColourPreview } from "./ColourPreview.tsx";
import { SignOutKeepInput } from "./SignOutKeep.tsx";
import { SettingDecide, SettingPresets } from "./setting-parts.tsx";

/** 設定の画面。
 *
 * 持っているのは **section の一覧**で、今は色 1 つ (DR-0002)。section が増える
 * 時にここが受け取るのは 1 行で、組・差の印・「戻す」・保存は section を問わ
 * ない部品が既に持っている。
 *
 * この画面は instance に何も聞かないが、**入れるのは接続後だけ** (DR-0004
 * §2.5) — 繋ぐ前の人に出す設定は、出した分だけ「繋ぐ」以外の道を増やす。
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
  {
    store: keys,
    note: "既定では 1 つも結ばれていません — 結ぶまで、この画面はどの打鍵も奪いません。ブラウザの手を奪う組み合わせは、何が失われるかを言ってから通します。ブラウザがページに渡さない打鍵は、設定できても効かないことをその場で言います。",
    Inputs: KeyBindings,
  },
  {
    store: signOutKeep,
    note: "切断はこの端末から降りることなので、既定では跡を残しません。残すのは読み方の好みだけで、認証・接続・セッションに属するものはこの設定でも残りません。",
    Inputs: SignOutKeepInput,
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
    <>
      {SECTIONS.map((one) => (
        <SectionPanel key={one.store.id} {...one} />
      ))}
    </>
  );
}
