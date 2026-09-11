import { render } from "preact";
import "./app.css";
import { watchRegisterLinks } from "./auth/register-link.ts";
import { adoptLocation, registration, resume } from "./state.ts";
import { App } from "./ui/App.tsx";

// A registration link may have brought a token in the fragment — on arrival, or
// into a tab that is already open.
watchRegisterLinks(
  {
    hash: () => location.hash,
    clearHash: () => history.replaceState(null, "", location.pathname + location.search),
    onHashChange: (react) => addEventListener("hashchange", react),
  },
  (held) => {
    registration.value = held;
  },
);

addEventListener("popstate", () => {
  adoptLocation();
});

// A registration is finished before anything is connected to: it is what says
// who this browser is, and it names the endpoint itself. Otherwise the page
// connects on what it already has, and asks for nothing it cannot get without
// the person: a browser with no session is left at a screen offering to
// connect, which is where asking for a passkey becomes something they pressed.
if (registration.peek() === undefined) void resume();

const root = document.getElementById("app");
if (root === null) throw new Error("#app がありません");
render(<App />, root);
