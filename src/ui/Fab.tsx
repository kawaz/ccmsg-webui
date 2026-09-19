import { useSignal } from "@preact/signals";
import type { Sid } from "@ccmsg/protocol";
import { sendability } from "../conversation/sendability.ts";
import { route } from "../state.ts";
import { Act, useAction } from "./Scope.tsx";
import { Composer } from "./Composer.tsx";
import { Modal } from "./Modal.tsx";

/** どこからでも話しかける口 (DR-0003 §2.7)。
 *
 * **宛先は今選んでいるセッション** — URL が名指しているものがそれで、見方
 * (transcript / ファイル / 端末 / 状態) のどれを開いていても届く先は 1 つ。
 * だから宛先を言う signal を別に持たない: 持つと、URL と宛先が食い違える形を
 * 自分で作ることになる。
 *
 * 木の上では**メインコンテンツの直下**に居て、その中身 (tl / files / …) の手前に
 * 浮く。担当を名乗るのはメインコンテンツの節なので、どの見方を開いていても同じ
 * 1 つが起きる。
 *
 * 開いた先は確認と同じ重なりの節 (§2.8) で、そこに composer をそのまま載せる
 * — 浮かせた専用の入力欄を別に作ると、送れるかの判定も下書きの置き場も 2 通りに
 * なる。 */

/** 今の宛先。セッションを名指していない画面では無い (= 開けない)。
 *
 * worker を読んでいる時の宛先は**その worker を起動したセッション**。worker は
 * instance に繋いでいないので話しかける相手にならず、URL が持っている sid が
 * そのまま答えになる。 */
function promptSid(): Sid | undefined {
  const at = route.value;
  if (at.at === "session" || at.at === "agent") return at.sid;
  return undefined;
}

export function Fab() {
  const sid = promptSid();
  const open = useSignal(false);
  useAction("main.open-prompt", {
    enabled: () => promptSid() !== undefined,
    run: () => {
      open.value = true;
    },
  });
  if (sid === undefined) return null;
  return (
    <>
      <Act action="main.open-prompt" class="fab" label="プロンプト入力欄を開く" title="話しかける">
        ✎
      </Act>
      {open.value && (
        <Modal
          label="このセッションに話しかける"
          kind="prompt"
          onClose={() => {
            open.value = false;
          }}
        >
          <Composer sid={sid} focused {...sendability(sid)} />
        </Modal>
      )}
    </>
  );
}
