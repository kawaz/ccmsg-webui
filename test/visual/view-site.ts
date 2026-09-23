import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

export interface ViewSite {
  readonly site: string;
  readonly origin: string;
  stop(): Promise<void>;
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

export async function startViewSite(port: number, parentOrigin: string): Promise<ViewSite> {
  process.env["CCMSG_WEBUI_ORIGIN"] = parentOrigin;
  await build({
    configFile: fileURLToPath(new URL("../../vite.config.view.ts", import.meta.url)),
    logLevel: "error",
  });
  const root = fileURLToPath(new URL("../../dist-view", import.meta.url));
  const index = readFileSync(join(root, "index.html"));
  const site = `localhost:${String(port)}`;

  const server: Server = createServer((request, answer) => {
    const url = new URL(request.url ?? "/", "http://x");
    const path = normalize(url.pathname);
    let body: Buffer;
    let type: string;
    let indexPage = false;
    try {
      if (path === "/" || path.startsWith("/view/")) throw new Error("起動の頁へ");
      body = readFileSync(join(root, path));
      type = TYPES[extname(path)] ?? "application/octet-stream";
    } catch {
      body = index;
      type = TYPES[".html"] as string;
      indexPage = true;
    }
    answer.writeHead(200, {
      "content-type": type,
      "cache-control": "no-store",
      ...(indexPage ? { "clear-site-data": '"cookies", "storage"' } : {}),
    });
    answer.end(body);
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    site,
    origin: `http://ccmsg-view-test.${site}`,
    stop: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
