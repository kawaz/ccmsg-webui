// navigation の応答に Cross-Origin-Opener-Policy を足す SW。hosting の header 無しで
// sandbox を継いだ別窓の遷移が塞がるかを見る。
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      const upstream = await fetch(event.request);
      const headers = new Headers(upstream.headers);
      headers.set("Cross-Origin-Opener-Policy", "same-origin");
      headers.set("X-Served-By-SW", "1");
      // Clear-Site-Data を SW の応答から評価するかを見る (csd.html だけ)
      if (new URL(event.request.url).pathname === "/csd.html") {
        headers.set("Clear-Site-Data", '"cookies"');
      }
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
      });
    })(),
  );
});
