import { useSignal } from "@preact/signals";
import { originOf, rpIdOf } from "@ccmsg/protocol";
import { defaultDeviceLabel } from "../auth/device-label.ts";
import { authProblem } from "../auth/session.ts";
import { completeRegistration, dismissRegistration, registration } from "../state.ts";

/** What a registration link opens on.
 *
 * The link says what is being registered and for whom; the six digits say that
 * whoever is at this browser was also at the terminal that issued it. Both are
 * shown together so the person can compare what they were told with what this
 * is about to do, and refuse it.
 *
 * Two addresses are shown because a credential is made against two (contract
 * DR-0029): the instance it admits its holder to, and the web UI it may be
 * presented from — which is this page, and which decides the domain the
 * passkey is stored under. */
export function Register() {
  const held = registration.value;
  const code = useSignal("");
  const label = useSignal(defaultDeviceLabel(navigator.userAgent));
  const working = useSignal(false);
  if (held === undefined) return null;
  const claims = held.claims;
  const ready = /^[0-9]{6}$/.test(code.value) && !working.value;

  return (
    <section class="section auth">
      <h2>passkey を登録する</h2>
      <dl class="auth-claims">
        <dt>利用者</dt>
        <dd>{claims.sub}</dd>
        {claims.issued_label !== undefined && (
          <>
            <dt>発行時のラベル</dt>
            <dd>{claims.issued_label}</dd>
          </>
        )}
        <dt>instance</dt>
        <dd>{claims.unit}</dd>
        <dt>endpoint</dt>
        <dd>
          <code>{claims.endpoint}</code>
        </dd>
        <dt>この画面 (passkey を作る所)</dt>
        <dd>
          <code>{claims.webui}</code>
        </dd>
        <dt>passkey のドメイン</dt>
        <dd>
          <code>{rpIdOf(claims.webui)}</code>
        </dd>
      </dl>
      <label>
        CLI が表示した 6 桁のコード
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code.value}
          onInput={(event) => {
            code.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 6);
          }}
        />
      </label>
      <label>
        この端末の名前
        <input
          type="text"
          maxLength={128}
          value={label.value}
          onInput={(event) => {
            label.value = event.currentTarget.value;
          }}
        />
      </label>
      {originOf(claims.webui) !== location.origin && (
        // 作れない登録。browser は別 origin の rpId で ceremony を走らせないし、
        // instance も clientDataJSON.origin を claims.webui と突き合わせる。
        // 押させてから browser の不透明なエラーに出会うより、先に言う。
        <p class="banner">
          この URL は <code>{claims.webui}</code> で開く前提で発行されています。そちらで開き直して
          ください。
        </p>
      )}
      {authProblem.value !== undefined && <p class="banner">{authProblem.value}</p>}
      <p class="auth-actions">
        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            working.value = true;
            void completeRegistration(code.value, label.value).finally(() => {
              working.value = false;
            });
          }}
        >
          {working.value ? "登録中…" : "登録する"}
        </button>
        <button type="button" onClick={dismissRegistration}>
          やめる
        </button>
      </p>
    </section>
  );
}
