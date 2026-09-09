import { render } from "preact";
import "./app.css";
import { adoptLocation, reconnectFromSettings } from "./state.ts";
import { App } from "./ui/App.tsx";

// The token may have arrived in the fragment; the settings module has taken it
// by now, so the address bar can be cleared of it before anything is shared.
if (location.hash !== "") history.replaceState(null, "", location.pathname + location.search);

addEventListener("popstate", () => {
  adoptLocation();
});

reconnectFromSettings();

const root = document.getElementById("app");
if (root === null) throw new Error("#app がありません");
render(<App />, root);
