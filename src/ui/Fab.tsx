import { useSignal } from "@preact/signals";
import type { JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";
import type { Sid } from "@ccmsg/protocol";
import { sendability } from "../conversation/sendability.ts";
import {
  fabPlace,
  MAX_HEIGHT,
  MIN_HEIGHT,
  placeBottom,
  placeHeight,
  placeRight,
  settle,
} from "../fab-place.ts";
import { route } from "../state.ts";
import { Act, Pane, useAction } from "./Scope.tsx";
import { Composer } from "./Composer.tsx";
import { StandHere, useStandingReturn } from "./Modal.tsx";

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
 * 開いた先は**口に付く窓**で、後ろは不活にしない — 話しかけながら、読んでいた
 * 所をそのまま触っていられるのが、どこからでも開く口の値打ち。木の上では確認と
 * 同じ扱い (§2.8) で、開いている間そこが立っている区画になる。
 *
 * 窓の居場所は口が決める (CSS anchor positioning)。口を動かせば窓も付いて動く
 * ので、覚えておく数は口の右下からの距離だけで足りる (`src/fab-place.ts`)。 */

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

/** 掴んで動かしたと見なす距離。これ未満で離した指は「押した」のまま — 押せる
 * ものが掴めるものでもある以上、どちらだったかは離す時まで決まらない。 */
const SLOP = 4;

/** 掴んでいる間ずっと届く指を 1 本だけ見る。掴み方はどれも同じ形なので、口と
 * 縁で 2 度書かない。
 *
 * **指を捕まえるのは、掴んだと決まってから** (`hold`)。押した所で捕まえると、
 * pointerup の後の click が捕まえた要素に付け替わり、中のボタンに届かなくなる
 * — 押すだけの指が何も起こさなくなる。逆に、捕まえた後は click がボタンへ
 * 行かないことがそのまま「動かした指は押していない」になる。 */
function grab(
  event: JSX.TargetedPointerEvent<HTMLElement>,
  onMove: (event: PointerEvent, hold: () => void) => void,
  onDone: () => void,
): void {
  const at = event.currentTarget;
  const id = event.pointerId;
  const hold = () => {
    if (!at.hasPointerCapture(id)) at.setPointerCapture(id);
  };
  const move = (one: PointerEvent) => {
    if (one.pointerId === id) onMove(one, hold);
  };
  const up = (one: PointerEvent) => {
    if (one.pointerId !== id) return;
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.removeEventListener("pointercancel", up);
    onDone();
  };
  // 指は要素の外まで行くので、届く所で聞く。捕まえた後もここに来る。
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
  document.addEventListener("pointercancel", up);
}

export function Fab() {
  const sid = promptSid();
  const open = useSignal(false);
  const hold = useRef<HTMLDivElement>(null);
  const window_ = useRef<HTMLDivElement>(null);
  /** 掴んで動かしたか。離した後の click を取り上げるのに要る。 */
  const moved = useRef(false);

  useAction("main.open-prompt", {
    enabled: () => promptSid() !== undefined,
    run: () => {
      open.value = true;
    },
  });

  // 窓は top layer に出る (popover)。`manual` なのは、口を掴んでいる間に窓が
  // 消えないため — ブラウザの light dismiss は口の上の pointerdown も「外」と
  // 数えるので、動かし始めた瞬間に閉じてしまう。閉じる手は下で 3 つとも持つ。
  useEffect(() => {
    const at = window_.current;
    if (at === null) return;
    if (open.value) {
      if (!at.matches(":popover-open")) at.showPopover();
    } else if (at.matches(":popover-open")) at.hidePopover();
  }, [open.value]);

  // 窓の外を押したら閉じる。口の上は「外」ではない — そこは掴んで動かす所で、
  // 動かしている最中に閉じては窓ごと動かせない。
  useEffect(() => {
    if (!open.value) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (window_.current?.contains(target) === true) return;
      if (hold.current?.contains(target) === true) return;
      open.value = false;
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, open.value]);

  if (sid === undefined) return null;

  const close = () => {
    open.value = false;
  };

  return (
    <>
      <div
        ref={hold}
        class="fab-place"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const from = { x: event.clientX, y: event.clientY };
          const start = fabPlace.draft.peek();
          moved.current = false;
          grab(
            event,
            (one, hold) => {
              const dx = from.x - one.clientX;
              const dy = from.y - one.clientY;
              if (Math.abs(dx) > SLOP || Math.abs(dy) > SLOP) {
                moved.current = true;
                hold();
              }
              if (!moved.current) return;
              fabPlace.edit({
                ...fabPlace.draft.peek(),
                right: placeRight(start) + dx,
                bottom: placeBottom(start) + dy,
              });
            },
            () => {
              // 置いた所を覚える。動かしていなければ書き戻すものが無い。
              if (moved.current) settle(fabPlace.draft.peek());
            },
          );
        }}
        // 動かし終えた指が押す所を起こさない。掴めるものは押せるものでもあるので、
        // どちらだったかは離した時にしか決まらない。
        onClickCapture={(event) => {
          if (!moved.current) return;
          event.preventDefault();
          event.stopPropagation();
          moved.current = false;
        }}
      >
        <Act
          action="main.open-prompt"
          class="fab"
          label="プロンプト入力欄を開く"
          title="話しかける (掴んで動かせます)"
        >
          ✎
        </Act>
      </div>
      <div
        ref={window_}
        popover="manual"
        class="fab-window"
        // 窓の中で Escape を打てば閉じる。開いた時に手は中に居るので、打鍵は
        // ここまで上がってくる。
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          close();
        }}
      >
        {open.value && <PromptWindow sid={sid} onClose={close} />}
      </div>
    </>
  );
}

/** 窓の中身。開いている間だけ在るので、立っている区画の出入りもここで完結する。 */
function PromptWindow({ sid, onClose }: { readonly sid: Sid; readonly onClose: () => void }) {
  useStandingReturn();
  return (
    <Pane name="prompt" label="このセッションに話しかける" class="fab-window-body">
      <StandHere />
      <p class="fab-window-head">
        <span>このセッションに話しかける</span>
        <button
          type="button"
          class="fab-close"
          aria-label="閉じる"
          title="閉じる"
          onClick={onClose}
        >
          ✕
        </button>
      </p>
      {/* 縁は上下 2 本。窓が口の上に開いている時は上へ伸びるのが自然だが、口が
          画面の上の方に居れば窓は下に開くので、どちらの縁も掴める。 */}
      <Grip edge="top" />
      <Composer
        sid={sid}
        focused
        // 送れたら閉じる。窓は用が済んだら消えるもので、続けて書くならもう一度
        // 開けばよい (下書きは同じ所に残っている)。
        onSent={onClose}
        {...sendability(sid)}
      />
      <Grip edge="bottom" />
    </Pane>
  );
}

/** 書く所の縁。掴んで上下に引くと高さが変わり、離した所で覚える。 */
function Grip({ edge }: { readonly edge: "top" | "bottom" }) {
  return (
    <div
      class={`fab-grip ${edge}`}
      role="separator"
      aria-orientation="horizontal"
      aria-label={edge === "top" ? "書く所の上の縁" : "書く所の下の縁"}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const from = event.clientY;
        const start = placeHeight(fabPlace.draft.peek());
        grab(
          event,
          (one, hold) => {
            hold();
            // 上の縁は引き上げるほど、下の縁は引き下げるほど広がる。
            const grew = edge === "top" ? from - one.clientY : one.clientY - from;
            const height = Math.min(Math.max(start + grew, MIN_HEIGHT), MAX_HEIGHT);
            fabPlace.edit({ ...fabPlace.draft.peek(), height });
          },
          () => {
            settle(fabPlace.draft.peek());
          },
        );
      }}
    />
  );
}
