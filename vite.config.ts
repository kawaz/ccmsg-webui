import { defineConfig, type Plugin } from "vite";
import { version } from "./package.json";

/** Where the dev server sends what belongs to an instance.
 *
 * A person developing against a daemon points this at the port it listens on;
 * the default is the one a daemon started without a configured port answers on. */
const DAEMON = process.env["CCMSG_DEV_DAEMON"] ?? "http://127.0.0.1:39847";

/** The routes an instance serves under its endpoint. The dev server stands
 * where a reverse proxy stands in the deployment that serves the UI and the
 * instance from one origin, so that everything below the endpoint answers on
 * the origin this page is served from — which is how a same-site cookie and a
 * `localhost` relying party are had without a certificate. Developing against
 * an instance on another origin needs none of it: the endpoint is typed into
 * the connection bar (contract DR-0029). */
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

/** Where this page may open a connection to.
 *
 * **Not an allowlist of instances.** Which instance is reached is the person's
 * to state at the connection bar, and a web UI is published independently of
 * the instances it dials (contract DR-0029) — one build is opened at many
 * endpoints, and endpoints come and go without it. An allowlist would have to
 * be baked in at build time, so every deployment and every new instance would
 * need a build of its own, which is the thing publishing the UI separately
 * exists to avoid.
 *
 * What is left to say is the shape: a transport that is encrypted, and the
 * socket scheme beside it. `'self'` is what a page served from under its own
 * instance's endpoint dials over plain HTTP on a development machine, and the
 * loopback sources below are added to that build alone.
 *
 * Nothing else is stated. A policy with one directive and no `default-src`
 * restricts what it names and nothing more, which is the whole of what this is
 * for. */
const CONNECT_SRC = ["'self'", "https:", "wss:"];
const CONNECT_SRC_DEV = [
  "http://localhost:*",
  "http://127.0.0.1:*",
  "ws://localhost:*",
  "ws://127.0.0.1:*",
];

function csp(dev: boolean): string {
  const sources = dev ? [...CONNECT_SRC, ...CONNECT_SRC_DEV] : CONNECT_SRC;
  return `connect-src ${sources.join(" ")}`;
}

export default defineConfig(({ command }) => ({
  base: BASE,
  plugins: [
    {
      name: "ccmsg-csp",
      transformIndexHtml: {
        order: "pre" as const,
        handler: (html: string) =>
          html.replace(
            "<head>",
            `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp(command === "serve")}" />`,
          ),
      },
    },
    {
      // この build の名前を、頁が後から聞き直せる所に置く。
      //
      // asset は名前が中身で決まるので永く持たせてよく (`immutable`)、index は
      // 毎回聞き直す (`no-cache`) — その 2 つだけでは、開いたままの頁は置き場が
      // 入れ替わったことを知らない。既に読み込んだ JS に焼かれている
      // `__WEBUI_VERSION__` と比べる相手が要るので、同じ出所 (`package.json`)
      // から 1 つの小さな文書を出す (`src/build-version.ts` が読む)。
      name: "ccmsg-build-version",
      apply: "build",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: `${JSON.stringify({ version, built_at: new Date().toISOString() }, null, 2)}\n`,
        });
      },
    } satisfies Plugin,
  ],
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
}));
