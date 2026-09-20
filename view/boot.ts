/** 閲覧 site の頁 1 枚がすること (DR-0005 §2.2)。
 *
 * Service Worker を登録し、親から受け取ったポートを SW へ引き渡し、**同じ
 * パスの中身をそのまま内側に置く**。それ以外は何もしない — ここに動く物を
 * 積まないことが、この site を読んで確かめ切れる大きさに留めている (§3 の
 * 不採用「閲覧 site に webui のコードを載せる」)。
 *
 * 中身を内側に置くのは、順番を**構造で**決めるため: ポートを渡してから中身を
 * 頼むので、「前の親のポートがまだ SW に残っている」状態で中身の要求が先に
 * 着く道が無い。置く先のパスは起動の頁と同じで、違うのは印の query 1 つだけ
 * — 相対参照は query に関わらず同じ `/view/...` へ落ちるので、§2.4 の効き目は
 * そのまま残る。 */

import { CONTENT_MARK, PORT, PORT_HELD, READY } from "./protocol.ts";

/** 親頁の出自。ビルド時の定数 (FV-Q7)。ここが合う相手からしかポートを取らない
 * (FV-Q8)。 */
declare const __PARENT_ORIGIN__: string;

async function boot(): Promise<void> {
  if (window.parent === window) {
    // 閲覧は常に親の頁の中の iframe (§2.2)。直接開かれた頁には渡す相手が
    // 居らず、ポートも来ない。
    show("この頁は単独では何も映しません。");
    return;
  }
  if (!("serviceWorker" in navigator)) {
    show("この環境では Service Worker が使えないため、閲覧できません。");
    return;
  }
  let worker: ServiceWorker;
  try {
    await navigator.serviceWorker.register("/sw.js", { type: "module", scope: "/" });
    // 待つのは**状態**で、登録が返った瞬間ではない: `ready` が答える登録は
    // active な worker を持っている。
    const ready = await navigator.serviceWorker.ready;
    if (ready.active === null) throw new Error("active worker がありません");
    worker = ready.active;
  } catch {
    show("Service Worker を登録できないため、閲覧できません。");
    return;
  }

  let placed = false;
  navigator.serviceWorker.addEventListener("message", (event: MessageEvent) => {
    if ((event.data as { ccmsg?: string } | undefined)?.ccmsg !== PORT_HELD) return;
    // 置くのは 1 度だけ。ポートを渡し直されても、既に映っている物は映ったまま。
    if (placed) return;
    placed = true;
    // SW が答えられるようになった。同じパスに印を付けて頼めば、今度は SW が
    // そのファイルのバイト列を返す。
    show("");
    const inner = document.createElement("iframe");
    inner.className = "content";
    inner.src = `${location.pathname}?${CONTENT_MARK}`;
    document.body.append(inner);
  });

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.origin !== __PARENT_ORIGIN__) return;
    if ((event.data as { ccmsg?: string } | undefined)?.ccmsg !== PORT) return;
    const port = event.ports[0];
    if (port === undefined) return;
    worker.postMessage({ ccmsg: PORT }, [port]);
  });

  // 待ち合わせを始めるのは頁の側から。SW が受け取れる状態になって初めて言う
  // ので、親は iframe がいつ立ったかを当てにいかなくてよい。
  window.parent.postMessage({ ccmsg: READY }, __PARENT_ORIGIN__);
}

function show(text: string): void {
  document.body.textContent = text;
}

void boot();
