import { authLost, enrolment, phase } from "../state.ts";
import { ConnectionBar } from "./ConnectionBar.tsx";
import { Disconnected } from "./Disconnected.tsx";
import { Enrolment } from "./Enrolment.tsx";
import { Reauth } from "./Reauth.tsx";
import { Shell } from "./Shell.tsx";
import { SignIn } from "./SignIn.tsx";

/** 画面ぜんぶのうち、**どの姿で立つか**を読んで選ぶ所 (DR-0004 §2.9)。
 *
 * 決めているのは `phase` 1 本で、ここはそれを `switch` するだけ。**ここ以外は
 * 姿を決める signal を読まない** — 姿を決める場所が 2 つあると、順番や優先が
 * 誰も点検していない裁定を作る (§1.2)。読んでよいのは中身を出す側だけで、
 * 「読まないこと」は文章ではなく test が守る (`test/phase.test.ts`)。
 *
 * 未接続の 5 つは接続の帯が主役で、その下に本文が立つ。接続後の 2 つは帯を
 * 持たず、`Shell` が workspace ごと組み立てる (§2.4)。
 *
 * 持たないもの: 並べ方 (= `Shell`)、どの画面か (= `Main`)、何を読むか (= 各画面)。 */
export function App() {
  switch (phase.value) {
    case "registering":
      // 登録 URL を開くのは人が起こしたページの読み込みで、読んでいたものを
      // 置き換えるのが正しい (§7 Q3)。捨てているように見えるものは instance が
      // 持っていて、読み込み直すか繋ぎ直せば戻る。
      return (
        <div class="app">
          <ConnectionBar />
          <Enrolment held={enrolment.value} />
        </div>
      );
    case "authenticating":
      return (
        <div class="app">
          {/* 何が起きているかは本文が言うので、帯は語を出さない。 */}
          <ConnectionBar words={false} />
          <SignIn />
        </div>
      );
    case "offline":
    case "connecting":
    case "receiving":
      // 一覧も transcript も「instance が今そう言っていること」なので、一度も
      // 聞いていない間は本文を描かない (空の一覧は「1 つも無い」という嘘になる)。
      return (
        <div class="app">
          <ConnectionBar />
          <Disconnected />
        </div>
      );
    case "live":
      return (
        <div class="app">
          <Shell />
        </div>
      );
    case "stale":
      // 一度立った本体は、回線が切れても認証が切れても消さない。回線なら退がり
      // ながら繋ぎ直すだけで、許可が切れている時だけ人に passkey を頼む (§2.4)。
      return (
        <div class="app">
          <Shell />
          {authLost.value && <Reauth />}
        </div>
      );
  }
}
