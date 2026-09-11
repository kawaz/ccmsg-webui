import type { LlmUsageCredential, LlmUsageLimit, LlmUsageSnapshot } from "@ccmsg/protocol";

/** クオータ画面の算術。窓の「どこまで来ているか」と、使い過ぎを色で言うかの
 * 判断が面倒な所なので、component の外に出して DOM 無しで試験する。 */

/** これより新しい観測に齢は書かない。どの行にも「0 分前」と書くのは雑音。 */
const FRESH_MS = 60_000;

/** 時計より何割先行したら注意色にするか。使い方は元々むらがあるので、
 * `使用率 > 経過率` をそのまま採ると半分の行がいつも光って意味を失う。5 ポイント
 * あれば、むらを吸った上で「窓が閉じる前に上限へ着く」場合だけが残る。 */
const PACE_MARGIN = 0.05;

const UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/** 色の区分。`bad` = upstream が今まさに断っている、`warn` = 通ってはいるが
 * この先が危うい (upstream がそう言ったか、使う速さがそう言っている)。 */
export type UsageTone = "ok" | "warn" | "bad";

/** 二重の帯 1 本を描くのに要るもの。窓と limit は単位も語彙も違うので、ここで
 * 同じ形に均してから帯を共有させる。 */
export interface BarRow {
  /** upstream の呼び名がそのまま見出しになる (窓なら `5h`、limit なら
   * `weekly_scoped`)。 */
  readonly key: string;
  /** 使った割合 0..1。limit は 0..100 で届くのでここで割る。 */
  readonly used: number;
  /** 期間の長さ (ms)。分からなければ undefined。 */
  readonly durationMs?: number;
  /** 期間のうち過ぎた割合 0..1。長さか reset が分からなければ undefined で、
   * その時は比べる相手が無いので速さの判断もしない。 */
  readonly elapsed?: number;
  /** 次に戻るまで (ms) と、その時刻そのもの。 */
  readonly remainingMs?: number;
  readonly resetAt?: number;
  /** 時計より目に見えて先行している。 */
  readonly overPace: boolean;
  readonly tone: UsageTone;
}

export interface WindowRow extends BarRow {
  readonly status: string;
  /** 読んだ時点が reset より前なので、今の消費ではなく終わった期間の話。 */
  readonly expired: boolean;
}

export interface LimitRow extends BarRow {
  /** upstream 自身の言葉。訳さない。 */
  readonly severity: string;
  readonly model?: string;
  /** upstream が今この枠を数えているか。色ではなく印で出す — 数えていない枠は
   * 健全という意味ではなく、数えている枠は超えたという意味でもない。 */
  readonly active: boolean;
}

/** 窓の名前が言っている長さ (`5h` → 5 時間)。分からない綴りは undefined で、
 * 窓は使用率だけで描かれる。 */
export function durationOfKey(key: string): number | undefined {
  const said = /^(\d+)([smhdw])$/.exec(key);
  if (said === null) return undefined;
  const amount = Number(said[1]);
  const unit = UNIT_MS[said[2] ?? ""];
  if (unit === undefined || amount <= 0) return undefined;
  return amount * unit;
}

/** 窓の長さ: upstream が言う `window_secs` が先で、無ければ名前から読む。
 * 言っている provider が自分の期間の正本で、`primary` のような名前は provider
 * ごとに違う長さを指しうるから、名前の解析では決められない。 */
export function windowDuration(key: string, window: { window_secs?: number }): number | undefined {
  const said = window.window_secs;
  if (said !== undefined && Number.isFinite(said) && said > 0) return said * 1000;
  return durationOfKey(key);
}

/** limit の期間: upstream が言う長さが先で、無ければ種類から分かるものだけ。
 * 推測しない — 知らない種類は消費だけを描く。 */
export function limitDuration(limit: LlmUsageLimit): number | undefined {
  const said = limit.window_secs;
  if (said !== undefined && Number.isFinite(said) && said > 0) return said * 1000;
  if (limit.kind === "session") return 5 * (UNIT_MS["h"] as number);
  if (limit.kind.startsWith("weekly_")) return 7 * (UNIT_MS["d"] as number);
  return undefined;
}

/** 期間の長さを、その名前と同じ綴りで (`5h`、`7d`)。残り時間の分母に置く。 */
export function shortDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0) return "";
  // 週を使わないのは、upstream の長い窓の名前が `7d` だから — `7d` の行の隣に
  // `/1w` と出ると別の期間に見える。
  for (const [unit, size] of [
    ["d", UNIT_MS["d"] as number],
    ["h", UNIT_MS["h"] as number],
    ["m", UNIT_MS["m"] as number],
  ] as const) {
    if (ms % size === 0) return `${String(ms / size)}${unit}`;
  }
  return `${String(Math.round(ms / (UNIT_MS["m"] as number)))}m`;
}

/** 1 日未満は `1h29m`、それ以上は `02d02h`。桁を揃えて、大きさの違いが一目で
 * 分かる形にする。 */
export function remainingWords(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  if (days > 0) return `${String(days).padStart(2, "0")}d${String(hours).padStart(2, "0")}h`;
  const minutes = Math.floor((total % 3600) / 60);
  return `${String(hours)}h${String(minutes).padStart(2, "0")}m`;
}

/** 観測の齢。新しいうちは書かない (undefined)。 */
export function ageWords(ageMs: number): string | undefined {
  if (ageMs < FRESH_MS) return undefined;
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `${String(minutes)} 分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)} 時間前`;
  return `${String(Math.floor(hours / 24))} 日前`;
}

export function percentWords(fraction: number): string {
  return `${String(Math.round(fraction * 100))}%`;
}

function paceOf(
  durationMs: number | undefined,
  remainingMs: number | undefined,
  used: number,
): { elapsed?: number; overPace: boolean } {
  if (durationMs === undefined || remainingMs === undefined) return { overPace: false };
  const elapsed = Math.min(1, Math.max(0, (durationMs - remainingMs) / durationMs));
  return { elapsed, overPace: used > elapsed + PACE_MARGIN };
}

function windowTone(status: string, overPace: boolean): UsageTone {
  if (status === "rejected") return "bad";
  if (status === "allowed_warning" || overPace) return "warn";
  return "ok";
}

/** upstream の verdict を同じ 3 段階へ。知らない語は `ok` に落とす — 語彙は
 * gateway が増やすもので、知らない語を赤くするのは読みから問題を作り出す
 * ことになる。 */
export function severityTone(severity: string): UsageTone {
  if (severity === "critical") return "bad";
  if (severity === "warning") return "warn";
  return "ok";
}

/** 窓は短い方から。gateway が並べた順に関わらず 5h → 7d と読めるようにする。
 * 長さの分からない名前は最後に、その中では名前順。 */
export function windowRows(snapshot: LlmUsageSnapshot, now: number): readonly WindowRow[] {
  return Object.entries(snapshot.windows)
    .sort(([a, wa], [b, wb]) => {
      const da = windowDuration(a, wa);
      const db = windowDuration(b, wb);
      if (da === undefined && db === undefined) return a.localeCompare(b);
      if (da === undefined) return 1;
      if (db === undefined) return -1;
      return da - db;
    })
    .map(([key, window]) => {
      const resetAt = window.reset_at;
      const remainingMs = resetAt === undefined ? undefined : Math.max(0, resetAt - now);
      const durationMs = windowDuration(key, window);
      const { elapsed, overPace } = paceOf(durationMs, remainingMs, window.utilization);
      const expired = window.expired === true;
      return {
        key,
        used: window.utilization,
        status: window.status,
        ...(durationMs === undefined ? {} : { durationMs }),
        ...(elapsed === undefined ? {} : { elapsed }),
        ...(remainingMs === undefined ? {} : { remainingMs }),
        ...(resetAt === undefined ? {} : { resetAt }),
        overPace,
        // 終わった期間には色を付けない: upstream が「もう数え直した」と言って
        // いるので、その前の `rejected` は今の話ではない。赤くすると終わった
        // 期間について警報を鳴らすことになる。行は「期限切れ」とだけ言い、
        // 数字は最後に分かっていたこととして残す。
        tone: expired ? "ok" : windowTone(window.status, overPace),
        expired,
      };
    });
}

/** limit も短い方から。長さの分からない種類は最後で、同じ長さなら upstream の
 * 順のまま (その方が、切り出し元の枠と並んで読める)。 */
export function limitRows(limits: readonly LlmUsageLimit[], now: number): readonly LimitRow[] {
  return limits
    .map((limit, index) => ({ limit, index }))
    .sort((a, b) => {
      const da = limitDuration(a.limit);
      const db = limitDuration(b.limit);
      if (da === db) return a.index - b.index;
      if (da === undefined) return 1;
      if (db === undefined) return -1;
      return da - db;
    })
    .map(({ limit }) => {
      // 単位の変換はここだけ: wire は 0..100 で、帯は 0..1 で描く。混ぜると
      // 47% の limit が満杯の帯になる。
      const used = limit.percent / 100;
      const resetAt =
        limit.resets_at === undefined || !Number.isFinite(limit.resets_at)
          ? undefined
          : limit.resets_at;
      const remainingMs = resetAt === undefined ? undefined : Math.max(0, resetAt - now);
      const durationMs = limitDuration(limit);
      const { elapsed, overPace } = paceOf(durationMs, remainingMs, used);
      const tone = severityTone(limit.severity);
      return {
        key: limit.kind,
        used,
        ...(durationMs === undefined ? {} : { durationMs }),
        ...(elapsed === undefined ? {} : { elapsed }),
        ...(remainingMs === undefined ? {} : { remainingMs }),
        ...(resetAt === undefined ? {} : { resetAt }),
        overPace,
        // upstream が異常と言えばそれが勝つ。速さの読みは普通の limit を注意へ
        // 上げるだけで、異常を下げることはしない。
        tone: tone === "ok" && overPace ? "warn" : tone,
        severity: limit.severity,
        ...(limit.model === undefined ? {} : { model: limit.model }),
        active: limit.is_active === true,
      };
    });
}

/** limit 行の見出し。種類はそのまま、枠が model に絞られている時だけ添える。 */
export function limitLabel(row: LimitRow): string {
  return row.model === undefined ? row.key : `${row.key} (${row.model})`;
}

/** 認証が健全でない credential について言うこと。無ければ undefined。
 *
 * 知らない status では何も言わない: 語彙は gateway のもので、見慣れない語を
 * 異常として出すのは、正常かもしれない field から警報を作り出すこと。 */
export interface AuthNotice {
  readonly tone: "warn" | "bad";
  readonly label: string;
  readonly reason?: string;
  /** 「ログインし直す」がブラウザで完結する時だけ。 */
  readonly loginUrl?: string;
  readonly age?: string;
}

export function authNotice(credential: LlmUsageCredential, now: number): AuthNotice | undefined {
  const auth = credential.auth;
  if (auth === undefined) return undefined;
  if (auth.status !== "relogin_required" && auth.status !== "degraded") return undefined;
  const relogin = auth.status === "relogin_required";
  const age =
    auth.observed_at === undefined ? undefined : ageWords(Math.max(0, now - auth.observed_at));
  return {
    tone: relogin ? "bad" : "warn",
    label: relogin ? "再ログインが必要" : "認証が不安定",
    ...(auth.reason === undefined ? {} : { reason: auth.reason }),
    // ブラウザの往復で直る状態にだけ出す。gateway はその経路で直せる
    // credential にしか path を送らないので、無いことは「CLI で直す」の意味で、
    // それは `reason` が言っている。
    ...(relogin && auth.login_url !== undefined ? { loginUrl: auth.login_url } : {}),
    ...(age === undefined ? {} : { age }),
  };
}

/** credential の `support` が言っていること。 */
export function supportWords(support: string): string {
  switch (support) {
    case "observed":
      return "クオータを観測できる credential";
    case "not_applicable":
      return "クオータという概念を持たない credential";
    case "upstream_dependent":
      return "上流サービスのクオータに従うので、ここからは観測できない";
    default:
      return "クオータを観測できるかどうかが不明";
  }
}

/** 観測の齢。upstream が時刻を言っていないか、まだ新しければ undefined。 */
export function snapshotAge(snapshot: LlmUsageSnapshot, now: number): string | undefined {
  if (snapshot.observed_at === undefined) return undefined;
  return ageWords(Math.max(0, now - snapshot.observed_at));
}
