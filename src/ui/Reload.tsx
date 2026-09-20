import { reloadWarning } from "../state.ts";
import { useAction } from "./Scope.tsx";

/** 読み込み直す所。**どの姿にも常に居る** (DR-0004 §2.4)。
 *
 * ホーム画面に追加した PWA にはブラウザの再読み込みが無いので、これが無いと人は
 * 読み込み直す手段を持たない。読み込み直す手段が端末によって在ったり無かったり
 * するのは、道具として当てにならない。
 *
 * **読み込み直すと直ることがあると、このボタンの色が変わる**。理由は 2 つ —
 * 契約の世代が instance と食い違った時と、置き場に新しい build が出ている時
 * (`src/build-version.ts`) — だが、人にとってはどちらも同じ 1 つの手なので、
 * 印も 1 つ。言葉だけが理由で変わる。
 *
 * 姿でも帯でもなく、既にある常設の押す所の見た目が変わるだけ — 帯を出すと押す
 * 所が 2 つになり、場所も取る。どちらの理由でも今出ている内容が読む価値を失う
 * わけではないので、隠さず、自動で読み込み直しもしない (書きかけも読んでいた
 * 場所も断りなく消える)。押すかどうかは人が選ぶ。 */
export function Reload() {
  const outdated = reloadWarning.value;
  const again = (): void => {
    location.reload();
  };
  // キーからも押す所からも同じ 1 つを通る (DR-0003 §2.1)。既定の綴りは無いので、
  // 欲しい人が設定で結ぶ。
  useAction("app.reload", { enabled: () => true, run: again });
  return (
    <button
      type="button"
      class={outdated === undefined ? "reload" : "reload outdated"}
      aria-label="読み込み直す"
      title={outdated === undefined ? "読み込み直す" : `${outdated} — 読み込み直してください`}
      onClick={again}
    >
      ↻
    </button>
  );
}
