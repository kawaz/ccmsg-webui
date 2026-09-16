import { MAIN, memberHue, USER } from "../member.ts";
import { CodeBlock } from "./CodeBlock.tsx";

/** 選んでいる色が、どこにどう効くか。
 *
 * **色を選ばせるだけでは何も決められない。** 色相の数字を動かしても、それが画面の
 * どこに出るかが見えなければ、良し悪しの言いようが無い。だからここは入力の隣に
 * 並び、触った瞬間に一緒に変わる — 変える仕掛けは持っていない。同じ `:root` の
 * 入力を読んでいるだけなので、入力が書き換われば勝手に解け直す。
 *
 * 出ているのは**実物の部品**で、見本のために作った四角ではない。`.tl-bubble` も
 * `.row` も `.dot` も、画面で使っているのと同じ規則で立っている — 見本用の CSS を
 * 別に持つと、そちらだけが古くなって「見て選んだ色」と「出てくる色」がずれる。 */

const SAMPLE = `export function hue(name: string): number {
  return wishedHue(name); // 名前から希望の色相
}`;

/** 1 人分の吹き出し。色相と声の段以外は timeline と同じもの。 */
function Bubble({
  who,
  hue,
  text,
  voice = "",
}: {
  who: string;
  hue: string;
  text: string;
  voice?: string;
}) {
  return (
    <div class={`tl-bubble member ${voice}`.trimEnd()} style={`--member-h:${hue}`}>
      <span class="tl-who">{who}</span>
      <div class="tl-body">
        <p class="tl-text">{text}</p>
      </div>
    </div>
  );
}

const STATUSES = [
  { name: "info", word: "知らせ" },
  { name: "success", word: "うまくいっている" },
  { name: "warning", word: "注意" },
  { name: "danger", word: "危険" },
] as const;

export function ColourPreview() {
  return (
    <aside class="theme-preview" aria-label="表示例">
      <h3>表示例</h3>
      <p class="meta">選んでいる色で、そのまま立っている所。触ると一緒に変わる。</p>

      <h4>誰が言ったか</h4>
      <div class="preview-timeline">
        <Bubble who="セッション" hue={memberHue(MAIN)} text="このセッションが言ったこと。" />
        <Bubble who="人" hue={memberHue(USER)} text="人が言ったこと。" />
        <Bubble
          who="← lead"
          hue={memberHue("session:lead")}
          text="別のセッションから届いた 1 通。"
          voice="quiet peer"
        />
        <Bubble
          who="→ reviewer"
          hue={memberHue("sub:reviewer")}
          text="サブエージェントへ渡した 1 通。"
          voice="quiet agent"
        />
        <div class="tl-aside member" style={`--member-h:${memberHue(MAIN)}`}>
          思考 (255 文字)
        </div>
        {/* `say` は誰かの声ではなく知らせなので、色相の軸には乗せない。 */}
        <div class="tl-bubble notice">
          <span class="tl-who">通知</span>
          <div class="tl-body">
            <p class="tl-text">呼びかけ (say) と、まだ記録になっていない 1 通。</p>
          </div>
        </div>
      </div>

      <h4>押せるもの</h4>
      <p class="preview-row">
        <button type="button">ボタン</button>
        <button type="button" class="on">
          選ばれている
        </button>
        <button type="button" disabled>
          押せない
        </button>
        <a href="#preview">リンク</a>
      </p>
      <span class="tabs preview-row">
        <a href="#preview" class="on">
          開いている
        </a>
        <a href="#preview">もう一方</a>
      </span>

      <h4>行</h4>
      <p class="meta">触れている間の色は、この行に触れると出る。</p>
      <div class="rows preview-rows">
        <div class="row">
          <span class="name">ふつうの行</span>
          <span class="meta">添えの文</span>
        </div>
        <div class="row">
          <span class="name">もう 1 行</span>
          <span class="meta">添えの文</span>
        </div>
      </div>

      <h4>意味の色</h4>
      <div class="preview-statuses">
        {STATUSES.map(({ name, word }) => (
          <div key={name} class="preview-status">
            <span
              class="preview-band"
              style={`background:var(--${name}-surface);color:var(--${name}-fg);border-color:var(--${name}-border)`}
            >
              {word}
            </span>
            <span
              class="preview-band solid"
              style={`background:var(--${name}-fill);color:var(--on-fill)`}
            >
              {word}
            </span>
          </div>
        ))}
      </div>

      <h4>見分けるための色</h4>
      <p class="preview-row">
        {[0, 1, 2, 3, 4, 5].map((nth) => (
          <span key={nth} class="search-chip" data-search-color={String(nth)}>
            語 {nth}
          </span>
        ))}
      </p>

      <h4>繋がっているか</h4>
      <p class="preview-row">
        <span class="dot open" aria-hidden="true" /> 接続済み
        <span class="dot" aria-hidden="true" /> 待ち
        <span class="dot closed" aria-hidden="true" /> 切れている
      </p>

      <h4>コード</h4>
      <p class="meta">構文の色はこの体系に繋がっていない。地と罫だけが選んだ色で立つ。</p>
      <CodeBlock code={SAMPLE} lang="ts" />
    </aside>
  );
}
