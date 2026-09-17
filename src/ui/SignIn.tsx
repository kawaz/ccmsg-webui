import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { authProblem, needsRegistration } from "../auth/session.ts";
import { connect, offerPasskey } from "../state.ts";

/** What stands in front of the app when connecting stopped at who is here.
 *
 * Two ways in, and they are the same act. The button is the one the bar has:
 * connecting and authenticating are one thing, and a person who pressed 接続 and
 * got this screen presses the same word again rather than learning a second one.
 * The field beside it is the standing offer — while this screen is up, the
 * browser may put the passkey of this page's origin in its own autofill, which
 * is how somebody who has not been here in a while finds it without knowing
 * which button to look for.
 *
 * A passkey answers for the origin this page is at, not for the instance being
 * dialed (contract DR-0030 §2). So a person who has one here reaches every
 * instance they own with it, and one who has none registers — which starts at a
 * terminal, on purpose (daemon DR-0001 §2.2), and is work for the person who
 * has no passkey rather than for the one whose finger slipped. */
export function SignIn() {
  const working = useSignal(false);
  // Taken back down with the screen: a standing ask outlives the component that
  // raised it, and the browser refuses a second one beside it.
  useEffect(() => offerPasskey(), []);
  return (
    <section class="section auth">
      <h2>passkey で認証する</h2>
      {authProblem.value !== undefined && <p class="banner">{authProblem.value}</p>}
      {needsRegistration.value && (
        <>
          <p class="empty">
            この端末には <code>{location.origin}</code> の passkey がありません (別の画面で作った
            passkey はここでは使えません)。
          </p>
          <p class="meta">
            登録するには、instance の管理者から <b>登録 URL と 6 桁のコード</b> を受け取って URL
            を開いてください。管理者は instance のある端末で <code>ccmsg user create</code>{" "}
            を実行すると発行できます。
          </p>
        </>
      )}
      <label>
        passkey
        <input
          type="text"
          name="passkey"
          // The whole point of this field: it is what a browser hangs the
          // passkey suggestion off (`mediation: "conditional"`). Nothing is
          // typed into it and nothing reads it — choosing the suggestion is the
          // sign-in, and a browser that does not offer one leaves it empty.
          autoComplete="username webauthn"
          placeholder="ここを選ぶと passkey の候補が出ます"
        />
      </label>
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
