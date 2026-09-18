import { computed, type ReadonlySignal, signal, type Signal } from "@preact/signals";
import { keepOnSignOut, localStore } from "./settings.ts";

/** 設定は **section の集合**で、section は入力の組。
 *
 * ここにあるのは section を**問わない**仕組みだけ — 覚えてある値と下書きを
 * 分けること、名前付きの組を配ること、ベースとの差を出して項ごとに戻すこと。
 * 何が入力で、それがどう画面に効くかは section の側が言う (DR-0002)。
 *
 * 触ることと決めることを分けるのは色だけの話ではない: 幅もフォントも「見て
 * みないと決められない」ので、試している間と決めた後の区別は section を問わず
 * 要る。だからここに置く。 */

/** 覚えてある値ぜんぶが入る 1 つの文書。section ごとの部分をその id で持つ。
 *
 * 文書を 1 つにするのは、section が増えても鍵が増えないため — 鍵が section の
 * 数だけ増えると、消すのも移すのも section の一覧を知っている誰かが要る。 */
const DOCUMENT = keepOnSignOut("ccmsg.settings");

function readDocument(): Record<string, unknown> {
  let held: unknown;
  try {
    held = JSON.parse(localStore.get(DOCUMENT) ?? "");
  } catch {
    return {};
  }
  if (typeof held !== "object" || held === null || Array.isArray(held)) return {};
  return held as Record<string, unknown>;
}

function writePart(id: string, part: unknown): void {
  localStore.set(DOCUMENT, JSON.stringify({ ...readDocument(), [id]: part }));
}

/** 名前付きの組。**その section の入力だけ**を配る。 */
export interface Preset<V> {
  readonly id: string;
  readonly label: string;
  /** その組が何を変える所なのか。選ぶ前に読めるように、画面に添えて出す。
   *
   * **名前だけで何が来るか分かる組には要らない**。既知のテーマ名のように、名前が
   * 既に世の中で通っているものに散文を添えると、名前より説明の方が長くなる。 */
  readonly note?: string;
  readonly value: V;
}

/** 1 つの section が言うこと。仕組みの側はこの形しか知らない。 */
export interface Section<V> {
  /** 文書の中でのこの section の名前。 */
  readonly id: string;
  /** 画面に出る見出し。 */
  readonly title: string;
  /** 何も選んでいない状態。「戻す」の行き先はいつもここか、ベースの値。 */
  readonly empty: V;
  readonly presets: readonly Preset<V>[];
  /** 覚えていた綴りを読む。読めない項は**その項だけ**捨てる — 1 つ壊れた値の
   * ために選んだものぜんぶを失わせない。文書にこの section の部分がまだ無い時
   * は `undefined` が来る。 */
  parse(held: unknown): V;
  /** 覚える綴り。`JSON.stringify` が通るものを返す。 */
  format(value: V): unknown;
  /** その値で画面を立たせる。色なら `:root` に書くこと。 */
  apply(value: V): void;
  /** ベースと下書きで違う項の名前。**選んでいないこと自体も 1 つの値**として
   * 比べる — 「戻す」がその項を消すことである以上、消えているかが差そのもの。 */
  changed(draft: V, from: V): ReadonlySet<string>;
  /** 何項かをまとめてベースへ戻した値。ベースがその項を持っていなければ、
   * 消すのが戻すこと。 */
  revert(draft: V, from: V, names: readonly string[]): V;
  /** 組を選んだ時、**今の下書きから何を連れて行くか**。
   *
   * 組が言っていない入力が section にはありうる。連れて行くかどうかはその入力の
   * 意味で決まるので、section が答える。連れて行った先がそのままベースになるので、
   * 選んだ直後の差はいつも 0 になる。 */
  adopt(draft: V, chosen: V): V;
  /** 項の名前を、画面に出す語に直す。差の読み上げに使う。 */
  wordFor(name: string): string;
}

/** 画面が section に頼むこと。**値の型を知らずに済む分だけ**を並べる。
 *
 * 組・差の印・「戻す」・保存を section を問わない部品で書けるのはこの面が
 * あるからで、部品の側に型引数を持ち込まずに済む (= 画面に `as` が要らない)。 */
export interface SectionFace {
  readonly id: string;
  /** 画面に出る見出し。 */
  readonly title: string;
  readonly presets: readonly {
    readonly id: string;
    readonly label: string;
    readonly note?: string;
  }[];
  /** 選んでいる組。選んでいなければ、比べる先は覚えてある値の方。 */
  readonly preset: Signal<string | undefined>;
  readonly diff: ReadonlySignal<ReadonlySet<string>>;
  readonly unsaved: ReadonlySignal<boolean>;
  /** 項の名前を、画面に出す語に直す。 */
  wordFor(name: string): string;
  choose(id: string): void;
  revert(names: readonly string[]): void;
  save(): void;
  discard(): void;
  resetToBase(): void;
}

/** section を触る所。画面が押すのはここだけで、localStorage も `:root` も
 * 直接は触らない。値の型を要るのは section 自身の入力 UI だけ。 */
export interface SectionStore<V> extends SectionFace {
  /** 覚えてある値。**ここが変わるのは `save()` を通った時だけ**。 */
  readonly saved: Signal<V>;
  /** 今画面に出ている下書き。触れば変わるが、覚えはしない。 */
  readonly draft: Signal<V>;
  /** 比べる先。「今どこから、どれだけ動かしたか」がこの 1 つで決まる。組を
   * 選べばその組 (下書きから連れて行くものを載せた姿)、選んでいなければ
   * 覚えてある値。 */
  readonly base: Signal<V>;
  edit(next: V): void;
}

/** 立ち上げた section ぜんぶ。`applySaved()` がここを歩く — 画面を描く前に
 * 覚えてある値を反映するのは、どの section にも要ること。 */
const standing: { apply: () => void }[] = [];

export function holdSection<V>(section: Section<V>): SectionStore<V> {
  const saved = signal<V>(section.parse(readDocument()[section.id]));
  const draft = signal<V>(saved.peek());
  const base = signal<V>(saved.peek());
  const preset = signal<string | undefined>(undefined);
  const diff = computed<ReadonlySet<string>>(() => section.changed(draft.value, base.value));
  const unsaved = computed<boolean>(() => section.changed(draft.value, saved.value).size > 0);

  function preview(next: V): void {
    draft.value = next;
    section.apply(next);
  }

  const store: SectionStore<V> = {
    id: section.id,
    title: section.title,
    presets: section.presets,
    wordFor: (name) => section.wordFor(name),
    saved,
    draft,
    preset,
    base,
    diff,
    unsaved,
    edit: preview,
    choose(id) {
      const chosen = section.presets.find((one) => one.id === id);
      if (chosen === undefined) return;
      preset.value = id;
      base.value = section.adopt(draft.peek(), chosen.value);
      preview(base.peek());
    },
    revert(names) {
      preview(section.revert(draft.peek(), base.peek(), names));
    },
    // 決めた所で初めて覚える。覚えた値が次のベースになるので、保存した直後は
    // 差が無い — 組を選んでいたことも、そこで役目を終える。
    save() {
      const next = draft.peek();
      saved.value = next;
      base.value = next;
      preset.value = undefined;
      writePart(section.id, section.format(next));
    },
    // 試したものを捨てて、覚えてある値に戻す。画面を離れる時もここを通る。
    discard() {
      preset.value = undefined;
      base.value = saved.peek();
      preview(saved.peek());
    },
    resetToBase() {
      preview(base.peek());
    },
  };
  standing.push({
    apply: () => {
      section.apply(saved.peek());
    },
  });
  return store;
}

/** 覚えてある値で画面を立たせる。描く前に 1 度だけ通る。 */
export function applySaved(): void {
  for (const one of standing) one.apply();
}
