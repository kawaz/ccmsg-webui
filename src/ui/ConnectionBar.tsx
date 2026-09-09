import { useSignal } from "@preact/signals";
import { connectionExpiresAt, subject } from "../auth/session.ts";
import { instanceLabel } from "../instance-label.ts";
import { isEntryUrl } from "../settings.ts";
import { connect, disconnect, endpoint, hello, status, statusDetail } from "../state.ts";

const WORDS: Record<string, string> = {
  idle: "未接続",
  connecting: "接続中",
  greeting: "hello 送信中",
  open: "接続済み",
  closed: "切断",
};

/** When this connection's authorization runs out, as the clock a person reads.
 *
 * The instant matters more than the countdown: what is renewed happens on its
 * own well before it, and what this is for is telling that the renewal is
 * moving it. */
function untilWords(at: number): string {
  return new Date(at).toLocaleTimeString();
}

/** Where the person says which instance to talk to.
 *
 * Only the address is typed: it is the one thing a static site cannot know, and
 * the one thing here that is not a secret. Who is connecting is answered by a
 * passkey and shown beside it. */
export function ConnectionBar() {
  const url = useSignal(endpoint.value ?? "");
  const state = status.value;
  const ready = isEntryUrl(url.value);

  return (
    <div class="bar">
      <span class={`dot ${state === "open" ? "open" : state === "closed" ? "closed" : ""}`} />
      <span>{WORDS[state] ?? state}</span>
      <input
        type="text"
        value={url.value}
        placeholder="ws://127.0.0.1:39847/ws"
        aria-label="daemon の WebSocket URL"
        onInput={(event) => {
          url.value = event.currentTarget.value;
        }}
      />
      <button
        type="button"
        disabled={!ready}
        onClick={() => {
          if (ready) connect(url.value);
        }}
      >
        接続
      </button>
      <button type="button" onClick={disconnect}>
        切断
      </button>
      {subject.value !== undefined && (
        <span class="meta">
          {subject.value}
          {connectionExpiresAt.value !== undefined &&
            ` / 期限 ${untilWords(connectionExpiresAt.value)}`}
        </span>
      )}
      {statusDetail.value !== undefined && <span class="meta">{statusDetail.value}</span>}
      {hello.value !== undefined && (
        <span class="footer">
          {instanceLabel(hello.value.instance, hello.value.endpoint)} / daemon {hello.value.version}{" "}
          / 契約世代 {hello.value.protocol_version}
        </span>
      )}
    </div>
  );
}
