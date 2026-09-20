import { MAX_FILE_READ_BYTES, type FileKind, type FileReadResult, type Sid } from "@ccmsg/protocol";
import { decodeBase64 } from "./bytes.ts";
import { mediaTypeFor } from "./media-type.ts";
import { isAbsolutePath, normalizePath, parentPath, ROOT, withinRoot } from "./paths.ts";
import { type BytesAsk, type BytesReply, GONE, PORT, READY } from "../../view/protocol.ts";

/** 閲覧 site のポートの、こちら側 (DR-0005 §2.2 / §2.6)。
 *
 * 閲覧 site は何の権限も持たない。持っているのはポート 1 本で、その向こうに
 * 居るのがこれ — **その瞬間にそのセッションへ接続していて `file.read` を通せる
 * webui の頁**。権限はその事実そのもので、URL に載る物は何も無い。
 *
 * ここは門番も兼ねる: 頼まれたパスが「今開いているものの周り」かを見てから
 * `file.read` に渡す (FV-Q12)。 */

/** 今開いている 1 つ。これが閲覧 site に許した範囲の全部。 */
export interface ViewGrant {
  readonly sid: Sid;
  readonly kind: FileKind;
  /** 人が開いたファイル。 */
  readonly path: string;
}

/** この頼みを通すか。
 *
 * 通すのは**開いたファイルと、その隣**。隣まで通すのは相対参照のため (§2.4)
 * — 描いた HTML の `<img src="./fig.png">` は同じ横取りに来るので、同じ folder
 * を通さなければディレクトリ単位の閲覧が成り立たない。
 *
 * `external` だけは開いたファイル 1 つに閉じる。契約の `external` が許して
 * いるのがその 1 ファイルだけで (契約 `FileKind`)、隣に降りる folder が無い。 */
export function allows(grant: ViewGrant | undefined, ask: BytesAsk): boolean {
  if (grant === undefined) return false;
  if (ask.sid !== grant.sid || ask.kind !== grant.kind) return false;
  const wanted = normalizePath(ask.path);
  if (wanted === grant.path) return true;
  if (grant.kind === "external") return false;
  // 絶対と相対が混ざる頼みは通さない。綴りが違う物は別の surface の物。
  if (isAbsolutePath(wanted) !== isAbsolutePath(grant.path)) return false;
  const dir = parentPath(grant.path) ?? ROOT;
  if (dir === ROOT) return !isAbsolutePath(wanted) && !wanted.startsWith("..");
  return withinRoot(wanted, dir);
}

/** 1 回の `file.read`。 */
type ReadOnce = (offset: number, length: number) => Promise<FileReadResult>;

/** 範囲を継いで、要求された分だけを流す (§2.3、FV-Q9)。
 *
 * 先読みはしない。`pull` が呼ばれて初めて次の範囲を頼むので、背圧は stream が
 * 受け持ち、誰も見ないバイト列を運ぶことにならない。1 回の答えが運べるのは
 * `MAX_FILE_READ_BYTES` までなので (契約 DR-0031 §2)、それより長い要求だけが
 * 割られて続く。 */
function ranges(read: ReadOnce, head: FileReadResult, total: number): ReadableStream<Uint8Array> {
  let at = head.offset;
  let sent = 0;
  let first: FileReadResult | undefined = head;
  return new ReadableStream<Uint8Array>({
    async pull(sink) {
      const reply = first ?? (await read(at, Math.min(total - sent, MAX_FILE_READ_BYTES)));
      first = undefined;
      const bytes = decodeBase64(reply.content);
      const take = Math.min(bytes.byteLength, total - sent);
      if (take > 0) sink.enqueue(bytes.subarray(0, take));
      at += bytes.byteLength;
      sent += take;
      // 進まない答えを返す相手と延々往復しない。終端も同じ所で閉じる。
      if (sent >= total || bytes.byteLength === 0) sink.close();
    },
  });
}

export class ViewPortHost {
  readonly #request: (
    op: string,
    args: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  readonly #grant: () => ViewGrant | undefined;
  #port: MessagePort | undefined;

  constructor(
    request: (op: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>,
    grant: () => ViewGrant | undefined,
  ) {
    this.#request = request;
    this.#grant = grant;
  }

  /** この頁が抱えている iframe へ、ポートを 1 本渡す。
   *
   * 渡すのは `targetOrigin` を閲覧 site に指定した `postMessage` で、向こうは
   * `event.origin` でこちらを確かめる (FV-Q8)。複製できない物が 1 回だけ渡る。 */
  give(to: Window, origin: string): void {
    const channel = new MessageChannel();
    this.#hold(channel.port1);
    to.postMessage({ ccmsg: PORT }, origin, [channel.port2]);
  }

  /** ポートを畳む。iframe を閉じた時に呼ぶ — 向こうが消えるのと同じこと
   * (§2.6)。 */
  close(): void {
    // 畳む前に一言。頁ごと消える時は言えないが、その時は entangle が切れる
    // ので、向こうは同じ所へ降りる (`sw.ts` の `close`)。
    this.#port?.postMessage({ ccmsg: GONE });
    this.#port?.close();
    this.#port = undefined;
  }

  #hold(port: MessagePort): void {
    this.#port?.close();
    this.#port = port;
    port.addEventListener("message", (event: MessageEvent) => {
      const ask = event.data as BytesAsk;
      if (ask.ask !== "bytes") return;
      void this.#answer(port, ask);
    });
    port.start();
  }

  async #answer(port: MessagePort, ask: BytesAsk): Promise<void> {
    const refuse = (status: number, reason: string): void => {
      port.postMessage({ id: ask.id, ok: false, status, reason } satisfies BytesReply);
    };
    if (!allows(this.#grant(), ask)) {
      refuse(403, "今開いているファイルの周りではありません");
      return;
    }
    const type = mediaTypeFor(ask.path);
    if (type === undefined) {
      refuse(415, "このファイルは閲覧に回せません");
      return;
    }
    const kind = ask.kind as FileKind;
    const path = normalizePath(ask.path);
    const read: ReadOnce = async (offset, length) =>
      (await this.#request("file.read", {
        sid: ask.sid,
        kind,
        path,
        offset,
        length,
      })) as unknown as FileReadResult;
    try {
      // 末尾から数えた範囲だけは、大きさを知らないと始点が決まらない。長さ 0 の
      // 読みが `size` を答えるので (契約 `FileReadResult`)、そこだけ 1 往復増える。
      let offset = ask.offset ?? 0;
      let wanted = ask.length;
      if (ask.suffix !== undefined) {
        const size = (await read(0, 0)).size;
        offset = Math.max(0, size - ask.suffix);
        wanted = size - offset;
      }
      const head = await read(offset, Math.min(wanted ?? MAX_FILE_READ_BYTES, MAX_FILE_READ_BYTES));
      const rest = Math.max(0, head.size - head.offset);
      const total = Math.min(wanted ?? rest, rest);
      const body = ranges(read, head, total);
      port.postMessage(
        { id: ask.id, ok: true, type, size: head.size, offset: head.offset, length: total, body },
        [body],
      );
    } catch (cause) {
      refuse(502, String(cause));
    }
  }
}

/** 閲覧 site の頁が「立った」と言ってきたか (FV-Q8 のこちら側)。
 *
 * 確かめるのは 2 つ — 出自が閲覧 site であることと、声の主が**自分が置いた
 * iframe** であること。 */
export function isReadyFrom(event: MessageEvent, origin: string, frame: Window | null): boolean {
  if (event.origin !== origin || event.source !== frame) return false;
  return (event.data as { ccmsg?: string } | undefined)?.ccmsg === READY;
}
