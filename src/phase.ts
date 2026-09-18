/** 画面ぜんぶのうち、**どの姿で立つか**を決める所 (DR-0004)。
 *
 * 姿は 7 つ。どれで立つかを決める場所はここだけで、`App.tsx` は答えを `switch`
 * するだけになる (§2.9) — 姿を決める条件が独立した signal の優先順に散っている
 * と、順番そのものが誰も点検していない裁定を作る (§1.2)。
 *
 * ここにあるのは**材料から姿を導く規則だけ**で、材料そのもの (signal) は持たない。
 * 導く側を signal から離してあるのは、姿の規則が signal の変化を待たずに
 * 確かめられる形でなければ、§2.9 の test が立たないため — `state.ts` は読み込み
 * だけでブラウザを要るので、それを連れてくる module は test から呼べない。
 * `phase` / `connected` は材料の隣 (`state.ts`) で、この規則に signal を渡す
 * 1 行として立つ。 */

export type Phase =
  /** 住所を述べる所があり、繋いでいない。 */
  | "offline"
  /** 登録 URL を開いた。 */
  | "registering"
  /** passkey を求める所に居る。 */
  | "authenticating"
  /** socket を開けている (名乗りの途中も含む)。 */
  | "connecting"
  /** socket は開いた、一覧の snapshot がまだ。 */
  | "receiving"
  /** 一覧があり、話し相手が居る。 */
  | "live"
  /** 一覧があり、話し相手が居ない。 */
  | "stale";

/** 姿を決める材料。**ここに並んでいるものが姿を決める signal のぜんぶ**で、
 * これ以外のものが姿に効くことはない。 */
export interface PhaseInputs {
  /** 登録 URL が運んできたものを持っているか (`enrolment`)。 */
  readonly enrolling: boolean;
  /** passkey を求める所に居るか (`needsSignIn`)。 */
  readonly needsSignIn: boolean;
  /** 一覧の snapshot を一度でも受け取ったか (`listed`)。 */
  readonly listed: boolean;
  /** socket が今していること (`status`)。 */
  readonly open: boolean;
  readonly greeting: boolean;
  /** 人が繋いでいるつもりか (`wanted`)。 */
  readonly wanted: boolean;
}

/** 材料から姿を導く。
 *
 * **上から順に読む**。順番そのものが裁定なので、1 か所に書いて §2.3 の遷移表で
 * 点検できる形にしてある。意味があるのは 2 つ:
 *
 * - `registering` が `live` より先 — 登録 URL を開くのは人が起こしたページの
 *   読み込みで、置き換わるのが正しい (§2.4、§7 Q3)
 * - `live` / `stale` が `receiving` / `connecting` より先 — 一度聞いた一覧が
 *   あるなら、回線が今どうであれ本体は立つ */
export function phaseOf(said: PhaseInputs): Phase {
  if (said.enrolling) return "registering";
  if (said.needsSignIn) return "authenticating";
  if (said.listed) return said.open ? "live" : "stale";
  if (said.open || said.greeting) return "receiving";
  if (said.wanted) return "connecting";
  return "offline";
}

/** 一覧が立っている姿か。DR-0003 §2.2 の木の根がどちらに立つかは、これが
 * 答える (§2.5) — 根が立つ条件を木の側で別に決めると、木と姿がずれる。 */
export function isConnected(at: Phase): boolean {
  return at === "live" || at === "stale";
}
