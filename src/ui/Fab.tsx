import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import type { Sid } from "@ccmsg/protocol";
import { canRun } from "../actions/tree.ts";
import { actionOf } from "../actions/catalogue.ts";
import { sendability } from "../conversation/sendability.ts";
import { fabPlace, followViewport, MAX_HEIGHT, MIN_HEIGHT, settle, toEdges } from "../fab-place.ts";
import { route } from "../state.ts";
import { standing } from "../actions/tree.ts";
import { Pane, useAction, useScope } from "./Scope.tsx";
import { Composer } from "./Composer.tsx";

/** 話しかける口 (DR-0003 §2.7)。
 *
 * **送る入口はここだけ**。transcript の下に据え置きの入力欄は無い — 据え置くと、
 * 読んでいる所を常に削る上に、files や状態を開いている間は消えるので、同じ
 * 「送る」が画面によって在ったり無かったりする。
 *
 * **宛先は今選んでいるセッション** — URL が名指しているものがそれで、見方
 * (transcript / ファイル / 端末 / 状態) のどれを開いていても届く先は 1 つ。
 * だから宛先を言う signal を別に持たない: 持つと、URL と宛先が食い違える形を
 * 自分で作ることになる。
 *
 * 木の上では**メインコンテンツの直下**に居て、その中身の手前に浮く。
 *
 * **ブラウザが既に持っているものは書かない**: 窓の居場所は CSS anchor
 * positioning が口から決め、画面の端での折り返しは `position-try-fallbacks`、
 * 閉じる手 (外を押す / `Escape`) は `popover` のライトディスミス、書く所の下への
 * 伸縮は `resize: vertical`、中身に合わせて伸びるのは `field-sizing: content`。
 * ここが書くのは **CSS に無い 3 つだけ** — 口を掴んで動かすこと、書く所の上の
 * 縁、そして置いた所と高さを覚えること (`src/fab-place.ts`)。 */

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
const SLOP = 5;

export function Fab() {
  const sid = promptSid();
  const scope = useScope();
  const open = useSignal(false);
  const box = useRef<HTMLButtonElement>(null);
  const window_ = useRef<HTMLDivElement>(null);

  useAction("main.open-prompt", {
    enabled: () => promptSid() !== undefined,
    run: () => {
      window_.current?.togglePopover();
    },
  });

  // 見えている所が変わったら口を置き直す (回転、窓の大きさ、ソフトキーボード)。
  useEffect(followViewport, []);

  if (sid === undefined) return null;

  const said = actionOf("main.open-prompt")?.title ?? "main.open-prompt";

  return (
    <>
      {/* 出し入れは `popovertarget` に預ける。押す所がアクションを起こす形
          (§2.4) からここだけ外れるのは、**アクションがすることが属性の持ち物
          そのもの**だから — 同じ出し入れを JS で書き直すと、ブラウザが既に
          やっていることの 2 つ目の実装になる。打鍵から起こす道は残っていて
          (`main.open-prompt`)、そちらも同じ 1 つを切り替える。

          この属性にはもう 1 つ効き目がある: 口が窓を呼んだ所になるので、口の
          上の pointerdown がライトディスミスに数えられない。だから窓を開けた
          まま口を掴んで動かせる。 */}
      <button
        ref={box}
        type="button"
        class="fab"
        popovertarget="fab-window"
        popovertargetaction="toggle"
        disabled={!canRun("main.open-prompt", scope)}
        aria-label={said}
        title="話しかける (掴んで動かせます)"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const at = event.currentTarget;
          const rect = at.getBoundingClientRect();
          const from = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
          let moved = false;
          // iframe (端末のタブ) の上を指が横切っても move / up が途切れないよう、
          // 押した所で掴む。掴んでも click は出るので、押しただけの指は
          // そのままアクションを起こす。
          at.setPointerCapture(event.pointerId);
          const onMove = (one: PointerEvent) => {
            if (one.pointerId !== event.pointerId) return;
            const dx = one.clientX - from.x;
            const dy = one.clientY - from.y;
            if (!moved && Math.hypot(dx, dy) < SLOP) return;
            moved = true;
            fabPlace.edit({
              ...fabPlace.draft.peek(),
              ...toEdges(from.left + dx, from.top + dy),
            });
          };
          const onUp = (one: PointerEvent) => {
            if (one.pointerId !== event.pointerId) return;
            at.removeEventListener("pointermove", onMove);
            at.removeEventListener("pointerup", onUp);
            at.removeEventListener("pointercancel", onUp);
            if (!moved) return;
            // 動かし終えた指が押す所を起こさない。掴めるものは押せるもの
            // でもあるので、どちらだったかは離した時にしか決まらない。
            const swallow = (click: MouseEvent) => {
              click.preventDefault();
              click.stopPropagation();
            };
            at.addEventListener("click", swallow, { capture: true, once: true });
            settle(fabPlace.draft.peek());
          };
          at.addEventListener("pointermove", onMove);
          at.addEventListener("pointerup", onUp);
          at.addEventListener("pointercancel", onUp);
        }}
      >
        <span aria-hidden="true">✎</span>
      </button>
      <div
        ref={window_}
        id="fab-window"
        popover="auto"
        class="fab-window"
        onToggle={(event) => {
          open.value = (event as unknown as { newState: string }).newState === "open";
        }}
      >
        {/* 中身は開く前から置いてある。開いた時に手が入力欄へ行くのは
            `autofocus` の持ち物で、それが効くのは**窓が開く時点で既に居る**
            要素だけ — 開いてから中身を作ると、手を動かす所を自分で書くことに
            なる。 */}
        <PromptWindow sid={sid} open={open.value} onClose={() => window_.current?.hidePopover()} />
      </div>
    </>
  );
}

/** 窓の中身。開いているかは props で受け取る — 中身は開く前から置いてあるので、
 * 立っている区画の出入りを mount で測ることはできない。 */
function PromptWindow({
  sid,
  open,
  onClose,
}: {
  readonly sid: Sid;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const body = useRef<HTMLDivElement>(null);

  // 書く所の下の摘み (`resize: vertical`) で変えた高さを覚える。摘みで変えた
  // 時だけ browser が要素に直接高さを書くので、**そこに高さが書かれたか**が
  // 「人が決めた」の印になる — 中身に合わせて伸びた分 (`field-sizing`) を
  // 覚えると、1 文字打った所で伸びるのをやめてしまう。
  useEffect(() => {
    const area = body.current?.querySelector("textarea");
    if (area === null || area === undefined) return;
    const watch = new ResizeObserver(() => {
      if (area.style.height === "") return;
      const height = area.getBoundingClientRect().height;
      if (height === fabPlace.draft.peek().height) return;
      settle({ ...fabPlace.draft.peek(), height });
    });
    watch.observe(area);
    return () => {
      watch.disconnect();
    };
  }, []);

  return (
    <Pane name="prompt" label="このセッションに話しかける" class="fab-window-body" hold={body}>
      <StandWhile open={open} />
      {/* 上の縁。窓は口の上に開くのが既定なので、上へ広げる手が要る — 下へは
          textarea 自身の摘み (`resize: vertical`) が既に効いている。 */}
      <Grip />
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
      <Composer
        sid={sid}
        focused
        // 送れたら閉じる。窓は用が済んだら消えるもので、続けて書くならもう一度
        // 開けばよい (下書きは同じ所に残っている)。
        onSent={onClose}
        {...sendability(sid)}
      />
    </Pane>
  );
}

/** 開いている間だけ、ここが立っている区画になる。閉じたら前の所へ返す。 */
function StandWhile({ open }: { readonly open: boolean }) {
  const scope = useScope();
  useEffect(() => {
    if (!open) return;
    const was = standing.peek();
    standing.value = scope;
    return () => {
      standing.value = was;
    };
  }, [open, scope]);
  return null;
}

/** 書く所の上の縁。掴んで引き上げると広がり、離した所で覚える。
 *
 * 下の縁を持たないのは、textarea が自分の摘みを持っているから (`resize:
 * vertical`)。同じことを 2 通りの掴み方で書かない。 */
function Grip() {
  return (
    <div
      class="fab-grip"
      role="separator"
      aria-orientation="horizontal"
      aria-label="書く所の上の縁"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const at = event.currentTarget;
        const area = at.parentElement?.querySelector("textarea");
        if (area === null || area === undefined) return;
        const from = event.clientY;
        const start = area.getBoundingClientRect().height;
        at.setPointerCapture(event.pointerId);
        const onMove = (one: PointerEvent) => {
          if (one.pointerId !== event.pointerId) return;
          const height = Math.min(Math.max(start + (from - one.clientY), MIN_HEIGHT), MAX_HEIGHT);
          fabPlace.edit({ ...fabPlace.draft.peek(), height });
        };
        const onUp = (one: PointerEvent) => {
          if (one.pointerId !== event.pointerId) return;
          at.removeEventListener("pointermove", onMove);
          at.removeEventListener("pointerup", onUp);
          at.removeEventListener("pointercancel", onUp);
          settle(fabPlace.draft.peek());
        };
        at.addEventListener("pointermove", onMove);
        at.addEventListener("pointerup", onUp);
        at.addEventListener("pointercancel", onUp);
      }}
    />
  );
}
