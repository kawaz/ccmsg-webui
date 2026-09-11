import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import type { Sid } from "@ccmsg/protocol";
import { composerAction } from "../conversation/composer-keydown.ts";
import { draftKey } from "../conversation/draft.ts";
import { describeSendOutcome } from "../conversation/send-outcome.ts";
import { localStore } from "../settings.ts";
import { hello, messageSendRefusal, sendMessage } from "../state.ts";

/** ここから人がセッションに話しかける。
 *
 * 送れるのは動いているセッションだけ: 止まったセッションへの `message.send` は
 * instance が断るので、断られてから理由を読ませるのではなく、送れないことと
 * その理由を先に書いておく。 */
export function Composer({ sid, live, why }: { sid: Sid; live: boolean; why: string }) {
  const instance = hello.value?.instance;
  const key = instance === undefined ? undefined : draftKey(instance, sid);
  const text = useSignal("");
  const outcome = useSignal<string | undefined>(undefined);
  const sending = useSignal(false);
  const box = useRef<HTMLTextAreaElement>(null);

  // 下書きはこのブラウザだけのもので、鍵は instance が答えてから決まる。
  // 読むのは鍵が決まった時の 1 度だけ — 打っている最中に読み戻すと、
  // 保存済みの古い文章で入力を上書きしてしまう。
  useEffect(() => {
    if (key === undefined) return;
    text.value = localStore.get(key) ?? "";
  }, [key, text]);

  const remember = (next: string) => {
    text.value = next;
    if (key !== undefined) localStore.set(key, next);
  };

  const send = () => {
    const body = text.value.trim();
    if (body === "" || sending.value) return;
    const refusal = messageSendRefusal(sid, body);
    if (refusal !== undefined) {
      outcome.value = refusal;
      return;
    }
    sending.value = true;
    outcome.value = undefined;
    sendMessage(sid, body)
      .then((result) => {
        outcome.value = describeSendOutcome(result);
        remember("");
        box.current?.focus();
      })
      .catch((cause: unknown) => {
        outcome.value = `送れませんでした: ${String(cause)}`;
      })
      .finally(() => {
        sending.value = false;
      });
  };

  if (!live) {
    return <p class="composer-closed">このセッションには送れません — {why}</p>;
  }

  return (
    <div class="composer">
      <textarea
        ref={box}
        rows={3}
        value={text.value}
        placeholder="このセッションに話しかける (Enter で改行、⌘/Ctrl+Enter で送信)"
        aria-label="セッションへのメッセージ"
        disabled={sending.value}
        onInput={(event) => {
          remember(event.currentTarget.value);
        }}
        onKeyDown={(event) => {
          if (composerAction(event) !== "send") return;
          // 改行は textarea 自身の仕事なので、送る時だけ打鍵を取り上げる。
          event.preventDefault();
          send();
        }}
      />
      <div class="composer-foot">
        <button type="button" disabled={sending.value || text.value.trim() === ""} onClick={send}>
          送信
        </button>
        {outcome.value !== undefined && <span class="composer-outcome">{outcome.value}</span>}
      </div>
    </div>
  );
}
