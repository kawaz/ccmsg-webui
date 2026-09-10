import { useSignal } from "@preact/signals";
import { authProblem } from "../auth/session.ts";
import { endpoint, signIn } from "../state.ts";

/** What stands in front of the app when there is nothing to connect with.
 *
 * One button: the passkey is asked for by the browser, which is where the
 * person is identified, and this page never sees more than the answer. A
 * registration is not offered here — it starts at a terminal, on purpose
 * (DR-0001 §2.2). */
export function SignIn() {
  const working = useSignal(false);
  return (
    <section class="section auth">
      <h2>passkey で認証する</h2>
      <p class="empty">
        <code>{endpoint}</code> で登録した passkey が要ります。別のホストやパスで登録した passkey
        は、ここでは使えません (登録は endpoint ごとです)。
      </p>
      {authProblem.value !== undefined && <p class="banner">{authProblem.value}</p>}
      <p class="auth-actions">
        <button
          type="button"
          disabled={working.value}
          onClick={() => {
            working.value = true;
            void signIn().finally(() => {
              working.value = false;
            });
          }}
        >
          {working.value ? "認証中…" : "passkey で認証"}
        </button>
      </p>
      <p class="meta">
        まだ登録していない端末なら、instance のある端末で <code>ccmsg daemon passkey add</code>{" "}
        を実行し、出てきた URL を開いてください。
      </p>
    </section>
  );
}
