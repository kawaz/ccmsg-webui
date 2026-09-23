/** 閲覧 site の頁 1 枚がすること (DR-0005 §2.1、§2.2、§2.5)。
 *
 * 親からの message を待ち、「開く」ならポートを受け取って Service Worker を登録し
 * SW へ引き渡して、**同じパスの中身をそのまま内側に置く**。「片付ける」なら
 * この origin に紐づく物を届く範囲で全部消して答える。それ以外は何もしない —
 * ここに動く物を積まないことが、この site を読んで確かめ切れる大きさに留めて
 * いる (§3 の不採用「閲覧 site に webui のコードを載せる」)。
 *
 * **読み込まれただけでは SW を登録しない**。掃除で開かれた頁が登録し直す道を
 * 構造で消すため (§2.5)。
 *
 * 中身を内側に置くのは、順番を**構造で**決めるため: ポートを渡してから中身を
 * 頼むので、「前の親のポートがまだ SW に残っている」状態で中身の要求が先に
 * 着く道が無い。置く先のパスは起動の頁と同じで、違うのは印の query 1 つだけ
 * — 相対参照は query に関わらず同じ `/view/...` へ落ちるので、§2.4 の効き目は
 * そのまま残る。 */

import { CLEAN, CLEANED, CONTENT_MARK, PORT, PORT_HELD, READY } from "./protocol.ts";

/** 親頁の出自。ビルド時の定数 (FV-Q7)。ここが合う相手からしか message を取らない
 * (FV-Q8)。 */
declare const __PARENT_ORIGIN__: string;

/** この origin に紐づく物を、届く範囲で全部消す (§2.5、FV-Q15)。
 *
 * hosting が起動の頁の応答に付ける `Clear-Site-Data` が同じ物を読み込みの時点で
 * 消しているので、ここは header が効かない環境の保険。SW の登録は scope を問わず
 * 全部 — 中身が閲覧 site 自身の `/sw.js` を深い scope で登録した物も、ここで
 * 一緒に外れる。cookie は JS からは自分のパスに見える物しか消せない (`Domain`
 * 付きの物は両方の綴りで失効させる)。 */
async function cleanOrigin(): Promise<void> {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
  localStorage.clear();
  sessionStorage.clear();
  if (indexedDB.databases) {
    const databases = await indexedDB.databases();
    await Promise.all(
      databases.flatMap((database) => {
        const name = database.name;
        if (name === undefined) return [];
        return [
          new Promise<void>((resolve) => {
            const request = indexedDB.deleteDatabase(name);
            request.onsuccess = request.onerror = () => resolve();
          }),
        ];
      }),
    );
  }
  await Promise.all((await caches.keys()).map((name) => caches.delete(name)));
  if (navigator.storage.getDirectory) {
    const root = await navigator.storage.getDirectory();
    for await (const [name, handle] of root.entries()) {
      await root.removeEntry(name, { recursive: handle.kind === "directory" });
    }
  }
  const site = location.hostname.replace(/^ccmsg-view-[^.]+\./, "");
  for (const pair of document.cookie.split(";")) {
    const name = pair.trim().split("=", 1)[0];
    if (!name) continue;
    document.cookie = `${name}=; Max-Age=0; Path=/`;
    document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${site}`;
  }
}

function show(text: string): void {
  document.body.textContent = text;
}

function boot(): void {
  // 閲覧は常に親の頁の中の iframe (§2.2)。直接開かれた頁には渡す相手が居らず、
  // ポートも来ない。
  if (window.parent === window) {
    show("この頁は単独では何も映しません。");
    return;
  }
  let opened = false;
  let placed = false;
  let cleaning = false;

  navigator.serviceWorker?.addEventListener("message", (event: MessageEvent) => {
    if ((event.data as { ccmsg?: string } | undefined)?.ccmsg !== PORT_HELD || placed || cleaning)
      return;
    // SW が答えられるようになった。同じパスに印を付けて頼めば、今度は SW が
    // そのファイルのバイト列を返す。置くのは 1 度だけ。
    placed = true;
    show("");
    const inner = document.createElement("iframe");
    inner.className = "content";
    inner.src = `${location.pathname}?${CONTENT_MARK}`;
    document.body.append(inner);
  });

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.origin !== __PARENT_ORIGIN__ || event.source !== window.parent) return;
    const said = event.data as { ccmsg?: string; nonce?: string } | undefined;
    if (said?.ccmsg === CLEAN && typeof said.nonce === "string" && !cleaning) {
      // nonce をそのまま返す。親が台帳から消してよいと判断できるのは、自分が
      // 送った nonce が返った時だけ (§2.5)。
      cleaning = true;
      void cleanOrigin().then(() => {
        window.parent.postMessage({ ccmsg: CLEANED, nonce: said.nonce }, __PARENT_ORIGIN__);
      });
      return;
    }
    if (said?.ccmsg !== PORT || opened || cleaning || !navigator.serviceWorker) return;
    const port = event.ports[0];
    if (port === undefined) return;
    opened = true;
    void navigator.serviceWorker
      .register("/sw.js", { type: "module", scope: "/" })
      // 待つのは**状態**で、登録が返った瞬間ではない: `ready` が答える登録は
      // active な worker を持っている。
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        if (registration.active === null) throw new Error("active worker がありません");
        registration.active.postMessage({ ccmsg: PORT }, [port]);
      })
      .catch(() => show("Service Worker を登録できないため、閲覧できません。"));
  });

  // 待ち合わせを始めるのは頁の側から。親は iframe がいつ立ったかを当てにいかなくて
  // よい。「開く」も「片付ける」も、これを聞いてから送られてくる。
  window.parent.postMessage({ ccmsg: READY }, __PARENT_ORIGIN__);
}

boot();
