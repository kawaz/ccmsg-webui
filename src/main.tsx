import { render } from "preact";
import "./app.css";
import { watchEnrolmentLinks } from "./auth/enrolment-link.ts";
import {
  adoptLocation,
  enrolment,
  holdEnrolment,
  resume,
  takeSignOutWord,
  watchHistory,
} from "./state.ts";
import { applySaved } from "./settings-section.ts";
import "./theme.ts";
import "./actions/keys.ts";
import { App } from "./ui/App.tsx";
import { listenForKeys } from "./ui/Scope.tsx";

// 覚えてあるものを `:root` に書いてから描く。選んでいない分は app.css のままで
// 立つので、ここが書くのは人が決めた項だけ。section が増えてもここは増えない。
applySaved();

// 降りた直後の読み込みなら、届かなかったという 1 行がここで引き取られる
// (DR-0004 §2.6)。降りるは読み込み直しで終わるので、渡せる場所が URL しかない。
takeSignOutWord();

// An enrolment link may have brought a token in the fragment — on arrival, or
// into a tab that is already open.
watchEnrolmentLinks(
  {
    hash: () => location.hash,
    clearHash: () => history.replaceState(null, "", location.pathname + location.search),
    onHashChange: (react) => addEventListener("hashchange", react),
  },
  holdEnrolment,
);

// 戻る / 進むが押せるかを Navigation API に聞き始める。
watchHistory();

addEventListener("popstate", () => {
  adoptLocation();
});

// An enrolment is finished before anything is connected to: it is what says
// who this browser is, and it names the endpoint itself. Otherwise the page
// connects on what it already has, and asks for nothing it cannot get without
// the person: a browser with no session is left at a screen offering to
// connect, which is where asking for a passkey becomes something they pressed.
if (enrolment.peek() === undefined) void resume();

// 打鍵を受ける口は画面ぜんぶで 1 つ。結ばれているものが無い間は何も起きない
// ので、ここが立っていること自体は人の打鍵を奪わない (DR-0003 §2.5)。
listenForKeys();

const root = document.getElementById("app");
if (root === null) throw new Error("#app がありません");
render(<App />, root);
