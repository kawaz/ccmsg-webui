import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

/** 閲覧 site のビルド (DR-0005 §2.1)。
 *
 * webui とは**別の site** に配る別の成果物なので、ビルドも別。出るのは頁 1 枚と
 * Service Worker 1 本だけで、webui のコードは一切入らない — 動く物を置かない
 * ことが、この site を読んで確かめ切れる大きさに留めている。
 *
 * 配り方 (FQDN・証明書・静的配信) はフロントの責務 (FV-Q2)。`/view/...` の
 * どの URL でも `index.html` を返すこと (起動の頁) だけが配信側への要求で、
 * それ以外は素の静的配信。 */

/** 親頁 (webui) の出自。ポートを渡してよい相手はここだけ (FV-Q8)。
 *
 * ビルド時の定数なのは webui 側の `__VIEW_ORIGIN__` と同じ理由 (FV-Q7): webui を
 * build するのも閲覧 site を配るのも hosting で、同じ場所で決まる値を 2 か所に
 * 持たない。 */
const PARENT_ORIGIN = process.env["CCMSG_WEBUI_ORIGIN"] ?? "";

const here = (at: string): string => fileURLToPath(new URL(at, import.meta.url));

export default defineConfig({
  root: here("./view"),
  base: "/",
  publicDir: false,
  build: {
    outDir: here("./dist-view"),
    emptyOutDir: true,
    rollupOptions: {
      input: { index: here("./view/index.html"), sw: here("./view/sw.ts") },
      output: {
        // SW の名前は動かせない。scope は script の置き場で決まるので、
        // site の根に `sw.js` という決まった名前で出す (`boot.ts` が登録する
        // のもこの綴り)。他の chunk は中身で名前が決まる普通の asset。
        entryFileNames: (chunk) => (chunk.name === "sw" ? "sw.js" : "assets/[name]-[hash].js"),
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  define: { __PARENT_ORIGIN__: JSON.stringify(PARENT_ORIGIN) },
});
