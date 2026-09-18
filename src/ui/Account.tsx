import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type { CredentialRecordPublic } from "@ccmsg/protocol";
import { connectionExpiresAt, user } from "../auth/session.ts";
import { instanceLabel } from "../instance-label.ts";
import {
  account,
  accountProblem,
  endpoint,
  hello,
  readAccount,
  removeCredential,
  removeOwnership,
} from "../state.ts";
import { RelativeTime } from "./RelativeTime.tsx";

/** 自分の姿。人と、その passkey と、持っている instance (契約 DR-0030 §8)。
 *
 * 3 段が 1 つの画面に居るのは、それが 1 枚の絵だから — 「この行は自分のものか、
 * 外してよいか」を決める人にとって、passkey だけ、instance だけを見ても答えが
 * 出ない。instance に聞いて出る画面なので、繋がっていない間は立たない。
 *
 * 外す操作の可否はこの画面が決めない。**今つないでいる instance の自分の所有**
 * と**今の接続が使っている passkey** は instance が `auth_in_use` で断り、それが
 * 帯に出る。ここで先回りして押せなくすると、どれが「今の」かを画面が二度目の
 * 答えとして持つことになり、instance の答えとずれる余地ができる。 */

/** 押した「外す」が本気かを確かめている行。id は 1 つだけ立つ。 */
const confirming = signal<string | undefined>(undefined);

/** 今の接続そのものについて (DR-0004 §2.4)。
 *
 * **接続後の状態の置き場はここ**で、画面の上の道ではない。道が持つのは「今どう
 * なっているか」を 1 つの印で言うことだけで、どの instance の何版に、誰として、
 * いつまで繋がっているかは、読みたくなった人が読みに来る所に置く — 常に出して
 * おくと、ほとんどの時間なにも決めない文字列が画面の幅を取り続ける。 */
function Connected() {
  const greeted = hello.value;
  const at = endpoint.value;
  const until = connectionExpiresAt.value;
  const who = user.value;
  return (
    <>
      <h3>この接続</h3>
      <dl class="auth-claims connection-facts">
        <dt>繋ぎ先</dt>
        <dd>
          <code>{at ?? "(住所がありません)"}</code>
        </dd>
        {greeted !== undefined && (
          <>
            <dt>instance</dt>
            <dd>{instanceLabel(greeted.instance, greeted.endpoint)}</dd>
            <dt>版</dt>
            <dd class="daemon-version">
              daemon {greeted.version} / 契約世代 {greeted.protocol_version}
            </dd>
          </>
        )}
        {who !== undefined && (
          <>
            <dt>誰として</dt>
            <dd>
              <code>{who}</code>
            </dd>
          </>
        )}
        {until !== undefined && (
          <>
            <dt>この接続の期限</dt>
            {/* 残りではなく時刻を出す。延長は勝手に起きるので、読む値打ちが
                あるのは「その延長が期限を動かしているか」の方。 */}
            <dd class="connection-until">{new Date(until).toLocaleTimeString()}</dd>
          </>
        )}
      </dl>
    </>
  );
}

export function Account() {
  useEffect(() => {
    void readAccount();
    return () => {
      confirming.value = undefined;
    };
  }, []);
  const held = account.value;
  return (
    <section class="section account">
      <h2>アカウント</h2>
      {accountProblem.value !== undefined && <p class="banner">{accountProblem.value}</p>}
      <Connected />
      {held === undefined ? (
        <p class="empty">instance に聞いています…</p>
      ) : (
        <>
          <dl class="auth-claims">
            <dt>名前</dt>
            <dd>{held.user.display_name ?? "(名前なし)"}</dd>
            <dt>id</dt>
            <dd>
              <code>{held.user.user}</code>
            </dd>
            <dt>作られた日</dt>
            <dd>
              <RelativeTime at={held.user.created_at} />
            </dd>
          </dl>

          <h3>passkey</h3>
          <ul class="account-list">
            {held.credentials.map((one) => (
              <Passkey key={one.credential_id} one={one} />
            ))}
          </ul>
          <p class="meta">
            passkey は <b>origin ごと</b>に 1 本要ります (契約 DR-0030 §2)。別の origin や別の
            端末で増やすには、instance のある端末で{" "}
            <code>ccmsg user passkey add {held.user.user} --origin &lt;その origin&gt;</code>{" "}
            を実行して、出た URL と 6 桁を使ってください。
          </p>

          <h3>持っている instance</h3>
          <ul class="account-list">
            {held.instances.map((one) => (
              <li key={one.instance}>
                <span class="account-name">{instanceLabel(one.instance, one.endpoint)}</span>
                <span class="meta">
                  <code>{one.instance}</code>
                </span>
                <span class="meta">
                  渡された <RelativeTime at={one.granted_at} />
                  {one.granted_by !== undefined &&
                    (one.granted_by.kind === "user"
                      ? ` / 足した人 ${one.granted_by.user}`
                      : ` / 足した instance ${one.granted_by.instance.slice(0, 8)}`)}
                </span>
                <Forget
                  id={`instance:${one.instance}`}
                  what="この instance を手放す"
                  act={() => removeOwnership(one.instance)}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Passkey({ one }: { readonly one: CredentialRecordPublic }) {
  return (
    <li>
      <span class="account-name">{one.device_label ?? "(名前のない端末)"}</span>
      <span class="meta">
        <code>{one.origin}</code>
      </span>
      <span class="meta">
        {one.issued_label !== undefined && `発行メモ ${one.issued_label} / `}
        登録 <RelativeTime at={one.registered_at} />
        {one.last_used_at !== undefined && (
          <>
            {" / 最終利用 "}
            <RelativeTime at={one.last_used_at} />
          </>
        )}
        {/* 同期されている鍵かどうか。外すと何が失われるかがこれで変わる
            (契約 `CredentialRecordPublic`)。 */}
        {one.backup_eligible === true && " / 同期される鍵"}
      </span>
      <Forget
        id={`credential:${one.credential_id}`}
        what="この passkey を外す"
        act={() => removeCredential(one.credential_id)}
      />
    </li>
  );
}

/** 外す操作。押してすぐには起きない。
 *
 * 取り返しは付く (passkey は作り直せるし、所有は足し直せる) が、どちらも **人に
 * 会いに行かないと戻せない** — CLI のある端末か、別の origin の browser が要る。
 * 1 回の誤クリックでそこまで行かせない。 */
function Forget({
  id,
  what,
  act,
}: {
  readonly id: string;
  readonly what: string;
  readonly act: () => Promise<void>;
}) {
  if (confirming.value !== id) {
    return (
      <button
        type="button"
        onClick={() => {
          confirming.value = id;
        }}
      >
        {what}
      </button>
    );
  }
  return (
    <span class="account-confirm">
      <button
        type="button"
        onClick={() => {
          confirming.value = undefined;
          void act();
        }}
      >
        本当に{what}
      </button>
      <button
        type="button"
        onClick={() => {
          confirming.value = undefined;
        }}
      >
        やめる
      </button>
    </span>
  );
}
