import { useSignal } from "@preact/signals";
import { defaultDeviceLabel, thisDevice } from "../auth/device-label.ts";
import { authProblem } from "../auth/session.ts";
import type { Enrolment as Held } from "../auth/enrolment-link.ts";
import { completeEnrolment, dismissEnrolment } from "../state.ts";

/** What an enrolment link opens on.
 *
 * The link says what is being done and for whom; the six digits say that
 * whoever is at this browser was also at the terminal that issued it. Both are
 * shown together so the person can compare what they were told with what this
 * is about to do, and refuse it.
 *
 * Two shapes, because the link carries two different operations (contract
 * DR-0030 §4). Making the person creates a passkey, so they say what to call
 * themselves and what to call this device. Handing them an instance asserts the
 * passkey they already have, so there is nothing to name — the account it joins
 * is one they have already named, and enrolling does not rename it.
 *
 * One address decides the ceremony: the origin the link names, which is where
 * the person was sent and the only place the passkey may be made or presented.
 * The endpoint beside it is where the answer is posted and is held to nothing
 * (contract DR-0030 §4), so it is shown as what it is. */
export function Enrolment({ held }: { readonly held: Held | undefined }) {
  // The form is a component of its own so that what a person typed belongs to
  // the link they typed it for: another link is another key, and the fields
  // start from what it says rather than from what the last one left.
  return held === undefined ? null : <EnrolmentForm key={held.token} held={held} />;
}

function EnrolmentForm({ held }: { readonly held: Held }) {
  const claims = held.claims;
  const creating = claims.purpose === "create_user";
  const code = useSignal("");
  const label = useSignal(defaultDeviceLabel(thisDevice(navigator)));
  const name = useSignal(claims.display_name ?? "");
  const working = useSignal(false);
  const elsewhere = claims.origin !== location.origin;
  const ready = /^[0-9]{6}$/.test(code.value) && !working.value && !elsewhere;

  return (
    <section class="section auth">
      <h2>{creating ? "passkey を登録する" : "この instance を受け取る"}</h2>
      <dl class="auth-claims">
        {claims.issued_label !== undefined && (
          <>
            <dt>発行時のラベル</dt>
            <dd>{claims.issued_label}</dd>
          </>
        )}
        <dt>instance</dt>
        <dd>{claims.instance}</dd>
        {claims.instances !== undefined && claims.instances.length > 0 && (
          <>
            <dt>一緒に渡される instance</dt>
            <dd>{claims.instances.join(", ")}</dd>
          </>
        )}
        <dt>endpoint (送り先)</dt>
        <dd>
          <code>{claims.endpoint}</code>
        </dd>
        <dt>この画面 (passkey の住所)</dt>
        <dd>
          <code>{claims.origin}</code>
        </dd>
      </dl>
      {creating && (
        <label>
          名前 (passkey の一覧に出ます)
          <input
            type="text"
            autoComplete="off"
            maxLength={128}
            value={name.value}
            onInput={(event) => {
              name.value = event.currentTarget.value;
            }}
          />
        </label>
      )}
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
      {creating && (
        <label>
          この端末の名前
          <input
            type="text"
            autoComplete="off"
            maxLength={128}
            value={label.value}
            onInput={(event) => {
              label.value = event.currentTarget.value;
            }}
          />
        </label>
      )}
      {elsewhere && (
        // ここでは成立しない。browser は別 origin の rpId で ceremony を走らせ
        // ないし、instance も clientDataJSON.origin を claims の origin と突き
        // 合わせる。押させてから browser の不透明なエラーに出会うより先に言う。
        <p class="banner">
          この URL は <code>{claims.origin}</code> で開く前提で発行されています。そちらで開き直
          してください。
        </p>
      )}
      {authProblem.value !== undefined && <p class="banner">{authProblem.value}</p>}
      <p class="auth-actions">
        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            working.value = true;
            void completeEnrolment(
              code.value,
              creating ? { displayName: name.value, deviceLabel: label.value } : {},
            ).finally(() => {
              working.value = false;
            });
          }}
        >
          {working.value ? "送信中…" : creating ? "登録する" : "受け取る"}
        </button>
        <button type="button" onClick={dismissEnrolment}>
          やめる
        </button>
      </p>
    </section>
  );
}
