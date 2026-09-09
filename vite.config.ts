import { defineConfig } from "vite";
import { version } from "./package.json";

/** A static site: no proxy to the daemon, because the daemon is another origin
 * by design (DR-0032 §2.1) and a dev-only proxy would hide the very thing this
 * build has to get right.
 *
 * JSX is compiled by esbuild's automatic runtime rather than by
 * `@preact/preset-vite`: what the preset adds is prefresh's HMR, and it brings
 * the whole Babel toolchain along for it. */
export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
  server: { port: 5173, strictPort: true },
  // The build this page reports in its greeting, taken from the one place the
  // version is written down.
  define: { __WEBUI_VERSION__: JSON.stringify(version) },
});
