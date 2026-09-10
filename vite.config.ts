import { defineConfig } from "vite";
import { version } from "./package.json";

/** Where the dev server sends what belongs to an instance.
 *
 * A person developing against a daemon points this at the port it listens on;
 * the default is the one a daemon started without a configured port answers on. */
const DAEMON = process.env["CCMSG_DEV_DAEMON"] ?? "http://127.0.0.1:39847";

/** The routes an instance serves under its endpoint. The dev server stands
 * where a reverse proxy stands in a real deployment, so that everything below
 * the endpoint answers on the origin this page is served from — which is what
 * a passkey, a cookie and this build's own idea of its endpoint all rest on
 * (DR-0001 §2.3). */
const INSTANCE_ROUTES = ["ws", "auth", "mesh", "webhook"];

/** Where the dev server pretends this build was published.
 *
 * The endpoint is the origin plus the base, so a page developed under a prefix
 * asks for `<base>auth/…` and the dev server has to answer there. The path is
 * forwarded as it arrived: an instance published under a prefix is reached
 * under that prefix, and refuses an exchange that came in anywhere else.
 * `--base` is the build's spelling of the same thing; the dev server needs it
 * before it can route, so it is read from the environment. */
const BASE = process.env["CCMSG_DEV_BASE"] ?? "/";

export default defineConfig({
  base: BASE,
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
  server: {
    port: 5173,
    strictPort: true,
    proxy: Object.fromEntries(
      INSTANCE_ROUTES.map((route) => [`${BASE}${route}`, { target: DAEMON, ws: route === "ws" }]),
    ),
  },
  // The build this page reports in its greeting, taken from the one place the
  // version is written down.
  define: { __WEBUI_VERSION__: JSON.stringify(version) },
});
