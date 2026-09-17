import type { ComponentChildren } from "preact";
import { createContext } from "preact";
import { useContext, useEffect, useLayoutEffect, useMemo, useRef } from "preact/hooks";
import { eventKey } from "../actions/binding.ts";
import { actionOf } from "../actions/catalogue.ts";
import { keymap } from "../actions/keys.ts";
import { canRun, type Handler, ROOT, run, runKey, Scope, standing } from "../actions/tree.ts";

/** スコープの木を画面に敷く所 (DR-0003 §2.2)。
 *
 * **木は名乗りから導かれる**: 区画になる部品が `<Pane name="tl.body">` と名乗り、
 * 入れ子がそのまま親子になる。図と定義を 2 つ持つと片方だけが古くなり、古く
 * なるのはいつも図の側で、しかもずれても何も壊れないので、気付かないまま人だけ
 * が誤った木を読む。
 *
 * ここが持つのは木と DOM の配線だけ。木そのものと起動の登り方は
 * `src/actions/tree.ts` にあり、DOM を知らない。 */

const ScopeContext = createContext<Scope>(ROOT);

export function useScope(): Scope {
  return useContext(ScopeContext);
}

/** このスコープがそのアクションの担当を名乗る。
 *
 * 渡す 2 つは毎描画作り直されてよい — 呼ばれた時に**その時の**関数を通るので、
 * 中で読んでいる値が古くなることはない。 */
export function useAction(id: string, handler: Handler): void {
  const scope = useScope();
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(
    () =>
      scope.handle(id, {
        enabled: () => latest.current.enabled(),
        run: () => {
          latest.current.run();
        },
      }),
    [scope, id],
  );
}

/** この区画が自分の役として持っている打鍵 (一覧の上下、`/`)。
 *
 * 設定のキーの表 (既定は空) とは別物で、`separator` が ← → で動くのと同じ所に
 * 居る — 一覧を上下で辿れることは、その区画が一覧であることの一部。 */
export function useScopeKeys(keys: Readonly<Record<string, string>>): void {
  const scope = useScope();
  const spelled = Object.entries(keys)
    .map(([spell, id]) => `${spell}=${id}`)
    .join(" ");
  useEffect(() => {
    const drop = Object.entries(keys).map(([spell, id]) => scope.bindKey(spell, id));
    return () => {
      for (const one of drop) one();
    };
    // 結び付けの中身が変わった時だけ張り直す (毎描画の object は同じ中身でも別物)。
  }, [scope, spelled]);
}

/** 宛先をこの区画にする。クリックでも打鍵でも移る (§2.2)。 */
export function standOn(scope: Scope): void {
  standing.value = scope;
}

/** 区画 1 つ。名乗った名前が木の節になり、立っている間は細い縁が付く。
 *
 * **DOM の focus は状態に追従する側** (§2.2)。立った節の代表要素へ focus を
 * 移すのは、キーのためだけではない — 読み上げに「今どの区画か」が伝わるのは
 * focus がそこに在る時だけで、状態の中にしか無いカーソルは読み上げられない。 */
export function Pane({
  name,
  label,
  class: className,
  children,
}: {
  name: string;
  /** 読み上げが言うこの区画の名前。 */
  label: string;
  class?: string;
  children: ComponentChildren;
}) {
  const parent = useScope();
  const scope = useMemo(() => new Scope(name, parent), [name, parent]);
  const box = useRef<HTMLDivElement>(null);
  const here = standing.value;
  const on = scope.contains(here);

  // 画面から消えた区画が宛先のままだと、以後の打鍵が誰にも届かない。親へ返す。
  useEffect(
    () => () => {
      if (scope.contains(standing.peek())) standing.value = parent;
    },
    [scope, parent],
  );

  // 立っている節の代表要素へ focus を移す。既にこの中の何かが focus を持って
  // いれば動かさない — 中のカーソル (roving tabindex) の方が細かい位置を知って
  // いる。
  useLayoutEffect(() => {
    const at = box.current;
    if (!on || at === null) return;
    if (at.contains(document.activeElement)) return;
    at.focus({ preventScroll: true });
  }, [on]);

  return (
    <ScopeContext.Provider value={scope}>
      <div
        ref={box}
        class={`pane-scope${on ? " standing" : ""}${className === undefined ? "" : ` ${className}`}`}
        tabIndex={-1}
        role="group"
        aria-label={label}
        // クリックした先の区画を宛先にする。**逆向きにはしない** — DOM の focus
        // が動いたら節を決め直す形にすると、入力欄をクリックしただけで区画が
        // 切り替わり、その後の上下が別の所に当たる。
        onPointerDownCapture={() => {
          standing.value = scope;
        }}
      >
        {children}
      </div>
    </ScopeContext.Provider>
  );
}

/** アクションを起こす押す所。
 *
 * `onClick` は**アクションを起こす 1 行**で、することの中身はアクション側に
 * ある (§2.4)。押せるかどうかも題も同じ所から出るので、`disabled` の判定が
 * 2 か所に無く、設定の一覧とボタンのラベルが別々に古くならない。 */
export function Act({
  action,
  label,
  title,
  class: className,
  children,
}: {
  action: string;
  /** 読み上げに渡す名前。省くと題がそのまま名前になる。 */
  label?: string;
  title?: string;
  class?: string;
  /** 押す所に出す語。省くとアクションの題が出る。 */
  children?: ComponentChildren;
}) {
  // 押す所が属する節がそのままスコープ (§2.2)。立っている節ではないので、
  // 見えているボタンが「今どこにフォーカスがあるか」で押せなくなることはない。
  const scope = useScope();
  const known = actionOf(action);
  return (
    <button
      type="button"
      class={className}
      disabled={!canRun(action, scope)}
      {...(label === undefined ? {} : { "aria-label": label })}
      {...(title === undefined ? {} : { title })}
      onClick={() => {
        run(action, scope);
      }}
    >
      {children ?? known?.title ?? action}
    </button>
  );
}

/** 文字を打っている最中か。
 *
 * DOM の focus が効くのは**この判定にだけ** (§2.2)。入力欄で打った文字が打鍵と
 * して解釈されては、そもそも文が打てない。 */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** 打鍵を受ける口。画面ぜんぶで 1 つ。
 *
 * 順は「人が結んだ表」→「区画が自分の役として持っている打鍵」。表が先なのは、
 * 人が結んだものの方が強いから — 一覧の上下を別のことに使いたい人が、区画の役
 * に阻まれるのはおかしい。
 *
 * どちらでも担当が見つからなければ**何もしない** (`preventDefault` しない)。
 * 割り当ててあるが今は誰も担当しない打鍵で、ブラウザの標準の手まで失うのは
 * 筋が通らない (§2.3)。 */
export function listenForKeys(): () => void {
  const onKey = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || typing(event.target)) return;
    const spell = eventKey(event);
    const bound = keymap.peek().get(spell);
    const ran = bound === undefined ? runKey(spell) : run(bound);
    if (ran !== "none") event.preventDefault();
  };
  window.addEventListener("keydown", onKey);
  return () => {
    window.removeEventListener("keydown", onKey);
  };
}
