/// <reference lib="webworker" />

/** webui の頁の応答に `Cross-Origin-Opener-Policy: same-origin` を足す Service
 * Worker (DR-0005 §2.2)。
 *
 * 閲覧 iframe の中身が `_top` / `_parent` / `window.open` で webui の URL を指すと、
 * WebKit は sandbox で塞いだ遷移を別窓に逃がし、iOS の PWA は scope 内の別窓を
 * PWA の窓そのものとして開く — 画面が乗っ取られる。sandbox を継いだ別窓は COOP が
 * `unsafe-none` でない文書を読み込めないので、webui の頁に COOP が付いていれば
 * その経路は全部エラー頁になる。COOP は応答 header 専用で meta では付けられず、
 * hosting に頼ると配り方ごとに設定が要るので、build に閉じるこの SW が足す。
 *
 * することはそれだけ。キャッシュもオフラインも push も持たない — 持てば古い頁を
 * 出す経路と、それを消す責務が生まれる (DESIGN §Service Worker)。 */

// 型の上では DOM の `self` (Window) と同じ名前なので、SW の global として読み直す。
// `declare const self` で宣言し直すには file を module にする (`export {}`) 必要が
// あり、dev server はそれを残したまま配る — classic script の SW では構文エラーに
// なる。import も export も持たない形に留めて、build と dev で同じ script にする。
const worker = self as unknown as ServiceWorkerGlobalScope;

// 新しい build の SW は待たずに入れ替わる。この SW は状態を持たないので、古い頁が
// 新しい SW の下に居ても壊れる物が無い。
worker.addEventListener("install", () => {
  void worker.skipWaiting();
});

// 初めて開いた頁も制御下に入れる。navigation を受けるのは scope の SW で、頁が
// 制御されているかどうかとは関係ないが、頁から見える状態 (`controller`) を初回と
// 2 回目とで分けない。
worker.addEventListener("activate", (event) => {
  event.waitUntil(worker.clients.claim());
});

worker.addEventListener("fetch", (event) => {
  // 足すのは文書の応答だけ。COOP は頁を読み込む時にしか評価されず、それ以外の
  // 要求は素通しにして何も変えない。
  if (event.request.mode !== "navigate") return;
  event.respondWith(withOpenerPolicy(event.request));
});

async function withOpenerPolicy(request: Request): Promise<Response> {
  const upstream = await fetch(request);
  // 転送の応答 (navigate は redirect を追わないので `opaqueredirect` で返る) は
  // header を読めず、組み直すこともできない。そのまま返せばブラウザが転送先を
  // 改めて頼み、それがまたここを通る。
  if (upstream.type === "opaqueredirect" || upstream.status === 0) return upstream;
  const headers = new Headers(upstream.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
