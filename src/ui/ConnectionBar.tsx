import { connectionExpiresAt, subject } from "../auth/session.ts";
import { instanceLabel } from "../instance-label.ts";
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

/** What this connection is, in one line.
 *
 * The instance is not chosen here: this page is served from under its endpoint,
 * so the address is shown rather than typed (DR-0001 §2.2). What is left to do
 * is stop and start it. Who is connected is answered by a passkey and shown
 * beside it. */
export function ConnectionBar() {
  const state = status.value;

  return (
    <div class="bar">
      <span class={`dot ${state === "open" ? "open" : state === "closed" ? "closed" : ""}`} />
      <span>{WORDS[state] ?? state}</span>
      <code class="endpoint">{endpoint}</code>
      <button
        type="button"
        disabled={endpoint === undefined}
        onClick={() => {
          connect();
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
