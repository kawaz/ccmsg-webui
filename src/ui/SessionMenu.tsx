import { useSignal } from "@preact/signals";
import { useRef } from "preact/hooks";
import type { PeerInfo, Sid } from "@ccmsg/protocol";
import { isLost, sessionLabel } from "../sessions.ts";
import { describeRefusal } from "../refusal.ts";
import {
  askFirst,
  can,
  forgetLostSession,
  killSession,
  markUnkilled,
  peers,
  renameSession,
  renaming,
  unkilled,
} from "../state.ts";
import { Act, useAction } from "./Scope.tsx";

/** 開いているセッション 1 つに効く操作 (DR-0004 §2.4)。
 *
 * **対象は URL が名指すセッション**で、一覧のカーソルではない。一覧の行に置くと、
 * 辿っている最中の行に危ない押す所がずっと出ていることになるし、行の幅も足りない
 * — 効く先が 1 つなら、その 1 つを開いている所に置けば足りる。
 *
 * 危ないもの (終了・強制終了・削除) は**メニューの中**。誤って押されて困るものを
 * 常時露出させないのは、道のハンバーガーと同じ判断。 */

/** そのセッションに効くアクションの担当。名乗るのはメインコンテンツの節なので、
 * どの見方 (transcript / ファイル / 端末 / 状態) を開いていても同じ 1 つが動く。 */
function useSessionActions(sid: Sid): void {
  const peerOf = (): PeerInfo | undefined => peers.value.find((one) => one.sid === sid);
  const ask = (action: string, note: string, go: () => void): void => {
    askFirst({ action, note, go });
  };
  useAction("session.rename", {
    // 改名は端末に打鍵を送ってもらう操作なので、端末を持つ instance でだけ。
    enabled: () => peerOf() !== undefined && can("terminal"),
    run: () => {
      renaming.value = sid;
    },
  });
  useAction("session.kill", {
    enabled: () => peerOf() !== undefined,
    run: () => {
      ask(
        "session.kill",
        "このセッションに終了を頼みます。消えなかった時だけ、強い方を選べるようになります。",
        () => {
          killSession(sid, false)
            .then((said) => {
              // 消えなかったのは失敗ではなく、次に何を選ぶかの材料 (契約)。
              markUnkilled(sid, !said.terminated);
            })
            .catch(() => {
              markUnkilled(sid, false);
            });
        },
      );
    },
  });
  useAction("session.kill-force", {
    // 強い方は**人が 1 度普通に頼んでから**選ぶもの (契約)。
    enabled: () => peerOf() !== undefined && unkilled.value.has(sid),
    run: () => {
      ask(
        "session.kill-force",
        "強い方は transcript を書き切る機会ごと奪います。書きかけの行は残りません。",
        () => {
          killSession(sid, true)
            .then((said) => {
              markUnkilled(sid, !said.terminated);
            })
            .catch(() => {
              /* 断られたことは一覧の行のままで分かる (次の snapshot が来る)。 */
            });
        },
      );
    },
  });
  useAction("session.forget", {
    enabled: () => {
      const peer = peerOf();
      return peer !== undefined && isLost(peer, Date.now());
    },
    run: () => {
      ask("session.forget", "instance がこのセッションを忘れます。一覧から消えます。", () => {
        void forgetLostSession(sid);
      });
    },
  });
}

/** 改名の入力。**開いているセッションの名前をその場で書き換える**ので、名前が
 * 出ている所に出る。確定と取り消しは入力欄の中で閉じる操作 (DR-0003 付録 A)。 */
function Rename({ peer }: { peer: PeerInfo }) {
  const draft = useSignal("");
  const problem = useSignal<string | undefined>(undefined);
  const commit = (): void => {
    const title = draft.value.trim();
    renaming.value = undefined;
    if (title === "") return;
    renameSession(peer.sid, title).catch((cause: unknown) => {
      problem.value = describeRefusal(cause);
    });
  };
  return (
    <>
      <input
        class="row-rename"
        type="text"
        autoFocus
        value={draft.value === "" ? sessionLabel(peer) : draft.value}
        aria-label="新しい名前"
        onInput={(event) => {
          draft.value = event.currentTarget.value;
        }}
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") renaming.value = undefined;
        }}
        onBlur={commit}
      />
      {problem.value !== undefined && <span class="meta">{problem.value}</span>}
    </>
  );
}

export function SessionMenu({ sid }: { sid: Sid }) {
  const box = useRef<HTMLDivElement>(null);
  useSessionActions(sid);
  const peer = peers.value.find((one) => one.sid === sid);
  const close = (): void => {
    box.current?.hidePopover();
  };
  if (peer !== undefined && renaming.value === sid) return <Rename peer={peer} />;
  const id = "session-menu";
  return (
    <>
      <button
        type="button"
        class="session-menu-open"
        popovertarget={id}
        aria-label="このセッションの操作"
        title="このセッションの操作"
      >
        ⋯
      </button>
      {/* 中の何かを押したら閉じる。押した先が確認を開く時、後ろにメニューが
          開いたまま残っていると、閉じたつもりの物がもう 1 枚ある。 */}
      <div ref={box} id={id} class="session-menu" popover="auto" onClick={close}>
        <Act action="session.rename" class="menu-row" />
        <Act action="session.kill" class="menu-row row-danger" />
        <Act action="session.kill-force" class="menu-row row-danger" />
        <Act action="session.forget" class="menu-row row-danger" />
      </div>
    </>
  );
}
