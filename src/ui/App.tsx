import { needsSignIn } from "../auth/session.ts";
import { listed, registration } from "../state.ts";
import { ConnectionBar } from "./ConnectionBar.tsx";
import { Disconnected } from "./Disconnected.tsx";
import { Register } from "./Register.tsx";
import { Shell } from "./Shell.tsx";
import { SignIn } from "./SignIn.tsx";

/** 画面ぜんぶのうち、**どの姿で立つか**だけを決める所。
 *
 * 姿は 4 つ。登録と認証は「このブラウザが誰か」の話なので、アプリの前に立つ
 * (後ろにあるものはそれ無しには読めない)。一度も一覧を聞いていない間は本文を
 * 描かず、聞いた後は `Shell` が組み立てる。
 *
 * 持たないもの: 並べ方 (= `Shell`)、どの画面か (= `Main`)、何を読むか (= 各画面)。 */
export function App() {
  if (registration.value !== undefined) {
    return (
      <div class="app">
        <Register />
      </div>
    );
  }
  if (needsSignIn.value) {
    return (
      <div class="app">
        <ConnectionBar />
        <SignIn />
      </div>
    );
  }
  // 一覧も transcript も「instance が今そう言っていること」なので、一度も
  // 聞いていない間は何も描かない。切れただけなら聞いたものは出したまま、
  // 古いことを帯が言う (`Disconnected` を読む)。
  if (!listed.value) {
    return (
      <div class="app">
        <ConnectionBar />
        <Disconnected />
      </div>
    );
  }
  return (
    <div class="app">
      <Shell />
    </div>
  );
}
