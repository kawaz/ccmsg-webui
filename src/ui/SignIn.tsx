import { useSignal } from "@preact/signals";
import { authProblem, needsRegistration } from "../auth/session.ts";
import { connect, endpoint } from "../state.ts";

/** What stands in front of the app when connecting stopped at who is here.
 *
 * One button, which is the same one the bar has: connecting and authenticating
 * are one act, and a person who pressed 接続 and got this screen presses the
 * same thing again rather than learning a second word for it.
 *
 * Registering is offered only once asking for a passkey has produced none — it
 * starts at a terminal, on purpose (DR-0001 §2.2), and it is work for the
 * person who has no passkey rather than for the one whose finger slipped. */
export function SignIn() {
  const working = useSignal(false);
  return (
    <section class="section auth">
      <h2>passkey で認証する</h2>
      {authProblem.value !== undefined && <p class="banner">{authProblem.value}</p>}
      {needsRegistration.value && (
        <>
          <p class="empty">
            この端末には <code>{endpoint}</code> の passkey がありません (別のホストやパスで登録した
            passkey は、ここでは使えません)。
          </p>
          <p class="meta">
            登録するには、この instance の管理者から <b>登録 URL と 6 桁のコード</b> を受け取って
            URL を開いてください。管理者は instance のある端末で{" "}
            <code>ccmsg daemon passkey add &lt;config home&gt;</code> を実行すると発行できます。
          </p>
        </>
      )}
      <p class="auth-actions">
        <button
          type="button"
          disabled={working.value}
          onClick={() => {
            working.value = true;
            void connect().finally(() => {
              working.value = false;
            });
          }}
        >
          {working.value ? "認証中…" : "passkey で認証"}
        </button>
      </p>
    </section>
  );
}
