import { signal } from "@preact/signals";
import { isDestructive } from "./catalogue.ts";

/** スコープの木と、起動が内側から外へ登る道 (DR-0003 §2.2、§2.3)。
 *
 * ここに DOM は出てこない。**立っている節はアプリの状態が正**で、画面のどこが
 * フォーカスを持っているかとは独立に読める (§2.2) ので、「選択中のセッションが
 * あり、宛先が TL で、選択中のメッセージがある時に何が担当するか」は状態を
 * 組むだけで確かめられる。DOM の focus はこの状態に**追従する側**にあり、
 * その配線は `src/ui/Scope.tsx` が持つ。 */

/** 1 つのアクションの担当。 */
export interface Handler {
  /** 今この瞬間に実行できるか。スコープが立っていることとは別 (§2.1)。 */
  enabled(): boolean;
  run(): void;
}

/** 木の 1 つの節。コンポーネントが `<Scope name="tl.body">` と名乗ったもの。
 *
 * **図ではなく名乗りが唯一の定義**なので、区画を動かせば木も動く (§2.2)。 */
export class Scope {
  readonly name: string;
  readonly parent: Scope | undefined;
  /** 根からここまでの綴り。画面に出す語ではなく、どの節かを言うための名前。 */
  readonly path: string;
  private readonly handlers = new Map<string, Handler>();
  /** この区画が自分の役として持っている打鍵 (一覧の上下、`/` など)。
   *
   * 設定のキーの表とは別物。表は人が結ぶもので既定は空 (§2.5)、こちらは
   * 「一覧なら上下で辿れる」という**区画の役そのもの**で、`separator` が ← →
   * で動くのと同じ所に居る。 */
  private readonly keys = new Map<string, string>();

  constructor(name: string, parent?: Scope) {
    this.name = name;
    this.parent = parent;
    this.path = parent === undefined ? name : `${parent.path}.${name}`;
  }

  /** 担当を名乗る。返るのは降ろす手で、区画が画面から消えた時に呼ぶ。 */
  handle(id: string, handler: Handler): () => void {
    this.handlers.set(id, handler);
    return () => {
      if (this.handlers.get(id) === handler) this.handlers.delete(id);
    };
  }

  /** 区画の役としての打鍵を名乗る。 */
  bindKey(spell: string, id: string): () => void {
    this.keys.set(spell, id);
    return () => {
      if (this.keys.get(spell) === id) this.keys.delete(spell);
    };
  }

  handlerOf(id: string): Handler | undefined {
    return this.handlers.get(id);
  }

  actionForKey(spell: string): string | undefined {
    return this.keys.get(spell);
  }

  /** 自分から根までの節を、内側から外の順で。 */
  chain(): readonly Scope[] {
    const walk: Scope[] = [this];
    for (let at = this.parent; at !== undefined; at = at.parent) walk.push(at);
    return walk;
  }

  /** その節が自分の中に居るか (自分自身も含む)。 */
  contains(other: Scope): boolean {
    return other.chain().includes(this);
  }
}

/** 根。画面がどんな姿で立っていても、ここまでは必ず登れる。 */
export const ROOT = new Scope("app");

/** 今キーを受ける節。**アプリの状態が正**で、DOM の focus ではない (§2.2)。
 *
 * クリックでも打鍵でも移る。移ったことは画面に出す (立っている区画の細い縁) —
 * どの区画が今キーを受けるかが見えないなら、キーは当たるも八卦になる。 */
export const standing = signal<Scope>(ROOT);

/** 今立っている節が、その綴りの節の中に居るか。区画の縁を出すかの判定。 */
export function standingIn(scope: Scope): boolean {
  return scope.contains(standing.value);
}

/** 起動の結果。
 *
 * `none` は**担当が 1 つも見つからなかった**こと。打鍵で起きたならブラウザに
 * 渡す (`preventDefault` しない) — 割り当ててあるが今は誰も担当しない打鍵で、
 * ブラウザの標準の手まで失うのは筋が通らない (§2.3)。 */
export type Dispatched = "ran" | "stopped" | "none";

/** id でアクションを起こす。今立っている最も内側の節から外へ向かって担当を
 * 探し、見つかった所で処理して止まる (§2.3)。
 *
 * **担当はするが今できない時は、既定で上へ流す** — 「TL に選択中のメッセージが
 * 無いから次へが効かない」時に、外側の一覧の「次へ」が代わりに動く方が、何も
 * 起きないより望みに近い。流れると困るもの (`destructive`) だけがそこで止まる。 */
export function run(id: string, from: Scope = standing.value): Dispatched {
  for (const scope of from.chain()) {
    const handler = scope.handlerOf(id);
    if (handler === undefined) continue;
    if (handler.enabled()) {
      handler.run();
      return "ran";
    }
    if (isDestructive(id)) return "stopped";
  }
  return "none";
}

/** その id を今起こせるか。押す所の `disabled` がここから出るので、押せるか
 * どうかの判定が 2 か所に無い (§2.4)。 */
export function canRun(id: string, from: Scope = standing.value): boolean {
  for (const scope of from.chain()) {
    const handler = scope.handlerOf(id);
    if (handler === undefined) continue;
    if (handler.enabled()) return true;
    if (isDestructive(id)) return false;
  }
  return false;
}

/** 区画の役として結ばれている打鍵を、内側から外へ探して起こす。
 *
 * 見つかった担当が今できなくても、**そこで打鍵の解決を止めない** — 同じ上下が
 * 外側の区画にも結ばれていることがあるので、`run` の流れ方と同じ形で外へ登る。 */
export function runKey(spell: string, from: Scope = standing.value): Dispatched {
  for (const scope of from.chain()) {
    const id = scope.actionForKey(spell);
    if (id === undefined) continue;
    const ran = run(id, scope);
    if (ran !== "none") return ran;
  }
  return "none";
}
