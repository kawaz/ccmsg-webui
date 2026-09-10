import { render } from "preact";
import "./app.css";
import { watchRegisterLinks } from "./auth/register-link.ts";
import { adoptLocation, connect, registration } from "./state.ts";
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
// who this browser is, and it names the endpoint itself.
if (registration.peek() === undefined) connect();

const root = document.getElementById("app");
if (root === null) throw new Error("#app がありません");
render(<App />, root);
