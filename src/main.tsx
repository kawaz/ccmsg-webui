import { render } from "preact";
import "./app.css";
import { adoptLocation, connect, registration } from "./state.ts";
import { App } from "./ui/App.tsx";

// A registration token may have arrived in the fragment; the state module has
// taken it by now, so the address bar can be cleared of it before the link is
// shared or reloaded.
if (location.hash !== "") history.replaceState(null, "", location.pathname + location.search);

addEventListener("popstate", () => {
  adoptLocation();
});

// A registration is finished before anything is connected to: it is what says
// who this browser is, and it names the endpoint itself.
if (registration.peek() === undefined) connect();

const root = document.getElementById("app");
if (root === null) throw new Error("#app がありません");
render(<App />, root);
