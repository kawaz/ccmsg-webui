/// <reference lib="webworker" />

/** 閲覧 site の仮想 web サーバ (DR-0005 §2.3)。
 *
 * することは 1 つだけ — 自分の scope の fetch を横取りし、ポート越しに親へ
 * 「この範囲のバイト列」を頼み、返ってきたヘッダと本文を `Response` にする。
 * 先読みも、一覧の取り寄せも、キャッシュも持たない (§2.5、FV-Q9)。
 *
 * ブラウザから見て普通の web サーバと区別が付かないので、`<img>` も `<video>`
 * の `Range` も `<iframe>` の中の相対参照も、何も足さずに動く (§2.4)。
 *
 * 自分で接続は張らない。閲覧 site に access token も endpoint の住所も置かない
 * ため (FV-Q12) で、繋がっているのは常に親頁 1 枚。 */

import {
  type BytesAsk,
  type BytesReply,
  CONTENT_MARK,
  GONE,
  parseRange,
  parseViewPath,
  PORT,
  PORT_HELD,
  VIEW_PREFIX,
} from "./protocol.ts";

declare const self: ServiceWorkerGlobalScope;

/** 親頁の出自。ビルド時の定数 (FV-Q7)。 */
declare const __PARENT_ORIGIN__: string;

/** 描く物に被せる CSP。
 *
 * 閉じ込めの本体は site の分離 (§1.3) と親が付ける `sandbox` (§6) で、これは
 * その内側でもう 1 枚。外へ出る先が何も無いことを言う — `'self'` が指すのは
 * 閲覧 site だけで、そこに居るのはこの SW が答える物しかない。描いた物の
 * script は走らせる (DR-0005 §6 FV-Q6): 閉じ込めは site の分離で効いていて、
 * script を止めても強くならない。 */
function contentCsp(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "base-uri 'none'",
    "form-action 'none'",
    // 上へ出る経路は親の `sandbox` が塞ぐが (§6)、埋められる先もこちらから
    // 言っておく: 抱えてよいのは起動の頁 (`'self'`) と、その外側に居る親頁
    // だけ。他所の site がこの URL を埋め込んでも、ポートが無いので何も
    // 映らないが、埋め込ませない方を先に言う。
    `frame-ancestors 'self' ${__PARENT_ORIGIN__}`,
  ].join("; ");
}

/** 今このワーカーが持っている 1 本のポート。
 *
 * 権限はこれ**そのもの** (§2.6)。持っていなければ何も答えられないので、URL を
 * 人に送られても、直接開かれても、届くのは断りだけ。 */
let port: MessagePort | undefined;

/** 往復の番号と、答えを待っている人たち。 */
let counter = 0;
const waiting = new Map<number, (reply: BytesReply) => void>();

self.addEventListener("install", () => {
  // 置き換えは即座に。持ち物が無いので、旧世代に配慮する理由が無い。
  void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.origin !== "" && event.origin !== self.location.origin) return;
  const said = event.data as { ccmsg?: string } | undefined;
  if (said?.ccmsg !== PORT) return;
  const given = event.ports[0];
  if (given === undefined) return;
  // 新しい頁が立ったら、そちらの親を相手にする。古いポートの向こうはもう
  // 居ないか、居ても同じ webui の頁なので、1 本だけ持てば足りる。
  port?.close();
  port = given;
  given.addEventListener("message", (answer: MessageEvent) => {
    const said = answer.data as { ccmsg?: string } | undefined;
    if (said?.ccmsg === GONE) {
      drop(given);
      return;
    }
    const reply = answer.data as BytesReply;
    const settle = waiting.get(reply.id);
    if (settle === undefined) return;
    waiting.delete(reply.id);
    settle(reply);
  });
  // 向こうの端が畳まれたら (親の頁が消えた時がそれ)、このポートはもう
  // 何も運ばない。待っている人たちをそこで降ろす — 答えの来ない往復を
  // 抱えたままにしない。
  given.addEventListener("close", () => {
    drop(given);
  });
  given.start();
  const back = event.source;
  if (back !== null) (back as Client).postMessage({ ccmsg: PORT_HELD });
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(VIEW_PREFIX)) return;
  // 素で開かれた navigate は**起動の頁**。何も答えなければ配信元がそれを返し、
  // その頁が親からポートをもらってから、印を付けて中身を頼む (`boot.ts`)。
  // 中身の要求が常にポートの後に来るのはこの 1 行のため。
  if (event.request.mode === "navigate" && !url.searchParams.has(CONTENT_MARK)) return;
  if (port === undefined) {
    event.respondWith(refusal(503, "この頁はまだ親と繋がっていません"));
    return;
  }
  event.respondWith(serve(event.request));
});

/** 1 本のポートを手放す。待っている往復は、そこで断りに変える。 */
function drop(given: MessagePort): void {
  if (port !== given) return;
  port = undefined;
  for (const [id, settle] of waiting)
    settle({ id, ok: false, status: 503, reason: "親が居ません" });
  waiting.clear();
  given.close();
}

function refusal(status: number, reason: string): Response {
  return new Response(`${reason}\n`, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

async function serve(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const named = parseViewPath(url.pathname);
  if (named === undefined) return refusal(404, "閲覧の URL の形ではありません");
  const range = parseRange(request.headers.get("range"));
  const reply = await ask({
    id: (counter += 1),
    ask: "bytes",
    sid: named.sid,
    kind: named.kind,
    path: named.path,
    ...range,
  });
  if (!reply.ok) return refusal(reply.status, reply.reason);
  const headers = new Headers({
    "content-type": reply.type,
    "content-length": String(reply.length),
    "accept-ranges": "bytes",
    // 残る物を作らない (§2.5)。同じファイルを 2 度開けば 2 度取りに行く。
    "cache-control": "no-store",
    // 型を決めるのは親で、ブラウザに嗅ぎ直させない (§2.3)。
    "x-content-type-options": "nosniff",
    "content-security-policy": contentCsp(),
  });
  if (range === undefined) return new Response(reply.body, { status: 200, headers });
  const last = reply.offset + reply.length - 1;
  headers.set(
    "content-range",
    `bytes ${String(reply.offset)}-${String(last)}/${String(reply.size)}`,
  );
  return new Response(reply.body, { status: 206, headers });
}

function ask(what: BytesAsk): Promise<BytesReply> {
  return new Promise((resolve) => {
    waiting.set(what.id, resolve);
    // 親が消えていれば答えは来ない。その時この頁ごと消えるので (§2.6)、
    // 待ち続ける相手は居ない。
    port?.postMessage(what);
  });
}
