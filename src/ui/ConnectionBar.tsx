import { useSignal } from "@preact/signals";
import { completeEntry } from "../settings.ts";
import { connect, disconnect, entry, hello, status, statusDetail } from "../state.ts";

const WORDS: Record<string, string> = {
  idle: "未接続",
  connecting: "接続中",
  greeting: "hello 送信中",
  open: "接続済み",
  closed: "切断",
};

/** Where the person says which instance to talk to.
 *
 * Both halves are typed here because a static site knows neither: it is served
 * from an origin the daemon has no relation to. */
export function ConnectionBar() {
  const url = useSignal(entry.value.url ?? "");
  const token = useSignal(entry.value.token ?? "");
  const state = status.value;
  const ready = completeEntry({ url: url.value, token: token.value });

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
      <input
        type="password"
        value={token.value}
        placeholder="entry token"
        aria-label="entry token"
        onInput={(event) => {
          token.value = event.currentTarget.value;
        }}
      />
      <button
        type="button"
        disabled={ready === undefined}
        onClick={() => {
          if (ready !== undefined) connect(ready);
        }}
      >
        接続
      </button>
      <button type="button" onClick={disconnect}>
        切断
      </button>
      {statusDetail.value !== undefined && <span class="meta">{statusDetail.value}</span>}
      {hello.value !== undefined && (
        <span class="footer">
          {hello.value.instance} / daemon {hello.value.version} / 契約世代{" "}
          {hello.value.protocol_version}
        </span>
      )}
    </div>
  );
}
