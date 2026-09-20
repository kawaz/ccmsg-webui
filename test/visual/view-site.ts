import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

/** 閲覧 site を、webui とは**別の site** に立てる (DR-0005 §2.1 / §5)。
 *
 * 配るのは素の静的配信で、配信側への要求は 1 つだけ — `/view/...` のどの URL
 * でも `index.html` (起動の頁) を返すこと。本番の proxy に足す行もこれと同じ
 * 形になる。
 *
 * 出すのは**ビルドした成果物**で、dev server ではない。SW の綴り (`/sw.js`) と
 * scope は配り方そのものなので、配られる形で確かめないと確かめたことにならない。
 *
 * site が違うことは host で作る: 頁は `localhost`、ここは `127.0.0.1`。同じ
 * 機械の上で別 site になる 2 つの綴りで、証明書も hosts も要らない
 * (どちらも secure context なので Service Worker が登録できる)。 */

export interface ViewSite {
  readonly origin: string;
  stop(): Promise<void>;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

export async function startViewSite(port: number, parentOrigin: string): Promise<ViewSite> {
  // 親の出自はビルド時の定数 (FV-Q7)。config が読むのは環境変数なので、
  // build を頼む前に言う。
  process.env["CCMSG_WEBUI_ORIGIN"] = parentOrigin;
  await build({
    configFile: fileURLToPath(new URL("../../vite.config.view.ts", import.meta.url)),
    logLevel: "error",
  });
  const root = fileURLToPath(new URL("../../dist-view", import.meta.url));
  const index = readFileSync(join(root, "index.html"));

  const server: Server = createServer((request, answer) => {
    const path = normalize(new URL(request.url ?? "/", "http://x").pathname);
    let body: Buffer;
    let type: string;
    try {
      if (path === "/" || path.startsWith("/view/")) throw new Error("起動の頁へ");
      body = readFileSync(join(root, path));
      type = TYPES[extname(path)] ?? "application/octet-stream";
    } catch {
      body = index;
      type = TYPES[".html"] as string;
    }
    answer.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    answer.end(body);
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    origin: `http://127.0.0.1:${String(port)}`,
    stop: () =>
      new Promise<void>((resolve) => {
        // 握ったままの接続ごと畳む。`close` だけでは、生きている keep-alive が
        // 1 本でもあると待ち続ける。
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
