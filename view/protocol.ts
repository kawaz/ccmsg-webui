/** 親頁 (webui) と閲覧 site の間で行き交う言葉 (DR-0005 §2.2 / §2.3)。
 *
 * ここに居るのは**形だけ**で、どちらの側の振る舞いも持たない。同じ綴りを 2 か所
 * に書かないために両側から読む 1 つの文書で、親は `src/files/view-port.ts` が、
 * 閲覧 site は `boot.ts` と `sw.ts` が読む。
 *
 * 運ぶのは常に「この sid の、この kind の、このパスの、この範囲のバイト列」で、
 * 何で繋がっているかは出てこない (§2.7)。 */

/** 閲覧の URL が始まる所。SW が横取りするのもこの下だけ。 */
export const VIEW_PREFIX = "/view/";

/** 閲覧 site が「頁が立って SW も居る」と親に言う。
 *
 * 親から先に声をかけない (= 親が iframe の load を待たない) のは、ポートを渡せる
 * のが **SW が受け取れる状態になってから**だから。頁の側が言えるようになった
 * 時に言うので、待ち合わせに時間の当て推量が要らない。 */
export const READY = "ccmsg-view-ready";

/** 親がポートを渡す (`postMessage` の transfer に port2 を載せる)。 */
export const PORT = "ccmsg-view-port";

/** SW がポートを受け取った、と頁に返す。頁はこれを見てから中身を置く。 */
export const PORT_HELD = "ccmsg-view-port-held";

/** 親が居なくなる、と SW に言う。ポートを畳む前の最後の 1 言。
 *
 * 言わずに消える経路もある (頁ごと閉じられた時) ので、SW は entangle の
 * 切断 (`close`) でも同じ所へ降りる。 */
export const GONE = "ccmsg-view-port-gone";

/** 「これは中身の要求」の印 (query)。
 *
 * 起動の頁と中身は**同じパス**に居る。パスの形を保つことが相対参照の効き目
 * そのものだから (§2.4) で、`./fig.png` は query に関わらず同じ `/view/...`
 * へ落ちる。区別が要るのは 1 点だけ — 素で開かれた navigate は起動の頁、印の
 * 付いた navigate は中身。これにより**中身の要求は常にポートを渡した後**に
 * なり、死んだポートで固まる道が無くなる。 */
export const CONTENT_MARK = "ccmsg-view";

/** SW が親に頼む 1 件。
 *
 * 頼むのは**要求どおりの範囲だけ**で、次に何を聞かれるかは当てにいかない
 * (FV-Q9)。`length` が無ければ終端まで、`suffix` は末尾から数えた長さ
 * (`Range: bytes=-N`) で、そちらは大きさを知らないと始点が決まらない。 */
export interface BytesAsk {
  /** この往復の番号。同じポートの上で複数の要求が並ぶ (頁の中の画像は同時に
   * 引かれる) ので、答えがどれのものかはこれで言う。 */
  readonly id: number;
  readonly ask: "bytes";
  readonly sid: string;
  readonly kind: string;
  readonly path: string;
  readonly offset?: number;
  readonly length?: number;
  readonly suffix?: number;
}

/** 親の答え。本文は `ReadableStream` をそのまま渡す (§2.3)。 */
export interface BytesAnswer {
  readonly id: number;
  readonly ok: true;
  /** 親が拡張子から決めた media type (§2.3 / FV-Q11)。 */
  readonly type: string;
  /** ファイル全体の大きさ。`Content-Range` の分母。 */
  readonly size: number;
  /** この答えが持つ範囲。 */
  readonly offset: number;
  readonly length: number;
  readonly body: ReadableStream<Uint8Array>;
}

/** 断り。門番が通さなかったか、instance が答えなかったか。 */
export interface BytesRefusal {
  readonly id: number;
  readonly ok: false;
  readonly status: number;
  readonly reason: string;
}

export type BytesReply = BytesAnswer | BytesRefusal;

/** ブラウザが聞いた範囲。`Range` が無ければ `undefined`。
 *
 * 読むのは 1 つの範囲だけ。飛び飛びの範囲 (`bytes=0-9,20-29`) は `multipart`
 * の答えを組むことになるが、それを送ってくるのは人が書いた fetch だけで、
 * `<video>` も `<img>` も 1 つずつしか聞かない。答えられない形には 1 つ目を
 * 返すのではなく**範囲を見なかったことにして全体を返す** (HTTP はそれを許す)。 */
export function parseRange(
  header: string | null,
): { offset?: number; length?: number; suffix?: number } | undefined {
  if (header === null) return undefined;
  const said = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (said === null) return undefined;
  const [, from, to] = said;
  if (from === "") {
    if (to === undefined || to === "") return undefined;
    const suffix = Number(to);
    return suffix > 0 ? { suffix } : undefined;
  }
  const offset = Number(from);
  if (to === undefined || to === "") return { offset };
  const last = Number(to);
  if (last < offset) return undefined;
  return { offset, length: last - offset + 1 };
}

/** `/view/<sid>/<kind>/<path>` を読み解く。
 *
 * パスの形をそのまま保つのがこの設計の効き目の中心なので (§2.4)、読み解きも
 * 素直な 3 分割で足りる。`<path>` に `/` が何個あってもそのまま `<path>`。 */
export function parseViewPath(
  pathname: string,
): { sid: string; kind: string; path: string } | undefined {
  if (!pathname.startsWith(VIEW_PREFIX)) return undefined;
  const parts = pathname.slice(VIEW_PREFIX.length).split("/");
  const sid = parts[0];
  const kind = parts[1];
  if (sid === undefined || sid === "" || kind === undefined || kind === "") return undefined;
  const path = parts.slice(2).map(decodeURIComponent).join("/");
  return { sid, kind, path };
}
