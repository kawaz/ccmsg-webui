import { KEEP_NAME, signOutKeep } from "../signout-keep.ts";
import { SettingRow } from "./setting-parts.tsx";

/** 「切断時にローカルの設定を残す」の入力 (DR-0004 §2.6)。
 *
 * 入力は 1 つで、既定は off。他の section と同じく**触ることは試すこと**で、
 * 覚えるのは「保存」を押した時 — ただしこの設定が効くのは切断を押した時
 * だけなので、試している間に画面が変わることは無い。 */
export function SignOutKeepInput() {
  const on = signOutKeep.draft.value.keep ?? false;
  return (
    <SettingRow store={signOutKeep} names={[KEEP_NAME]} label="切断時にローカルの設定を残す">
      <input
        type="checkbox"
        checked={on}
        aria-label="切断時にローカルの設定を残す"
        onChange={(event) => {
          signOutKeep.edit({ keep: event.currentTarget.checked });
        }}
      />
    </SettingRow>
  );
}
