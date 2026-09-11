import type {
  LlmStatusIncident,
  LlmStatusObservedState,
  LlmStatusOfficialState,
  LlmStatusReport,
  LlmStatusService,
  LlmStatusSeverity,
} from "@ccmsg/protocol";

/** gateway の上流報告の読み方: severity にどの色と名前を当てるか、2 つの signal
 * をどう言い分けるか、どの行が上に来るか。
 *
 * **verdict は gateway が決める**。official / observed から severity を導き直す
 * ことはしない — 同じ報告を読む他の全員と違う結論を出すことになる。ここに
 * あるのは言葉と順序だけ。 */

export type StatusTone = "ok" | "warn" | "bad" | "unknown";

const TONES: Record<LlmStatusSeverity, StatusTone> = {
  ok: "ok",
  warning: "warn",
  critical: "bad",
  unknown: "unknown",
};

export function severityTone(severity: LlmStatusSeverity): StatusTone {
  return TONES[severity] ?? "unknown";
}

/** 色だけでなく印も置く。速く読めるのは色だが、色が読めない人には届かない —
 * ここは障害を知らせる行なので、印の側も持つ。 */
const MARKS: Record<LlmStatusSeverity, string> = {
  ok: "●",
  warning: "▲",
  critical: "■",
  unknown: "?",
};

export function severityMark(severity: LlmStatusSeverity): string {
  return MARKS[severity] ?? MARKS.unknown;
}

const SEVERITY_WORDS: Record<LlmStatusSeverity, string> = {
  ok: "正常",
  warning: "注意",
  critical: "障害",
  unknown: "不明",
};

export function severityWords(severity: LlmStatusSeverity): string {
  return SEVERITY_WORDS[severity] ?? SEVERITY_WORDS.unknown;
}

/** provider 自身の言葉。下の observed と語彙を分けてあるので、2 列が 1 つの
 * 尺度に見えることはない — 「稼働中」は provider の主張で、「疎通」はこの
 * gateway がやってみたこと。 */
const OFFICIAL_WORDS: Record<LlmStatusOfficialState, string> = {
  operational: "稼働中",
  degraded: "性能低下",
  partial_outage: "一部障害",
  major_outage: "大規模障害",
  maintenance: "メンテナンス",
  unknown: "不明",
};

export function officialWords(state: LlmStatusOfficialState): string {
  return OFFICIAL_WORDS[state] ?? OFFICIAL_WORDS.unknown;
}

const OBSERVED_WORDS: Record<LlmStatusObservedState, string> = {
  reachable: "疎通",
  failing: "失敗",
  unknown: "未観測",
};

export function observedWords(state: LlmStatusObservedState): string {
  return OBSERVED_WORDS[state] ?? OBSERVED_WORDS.unknown;
}

/** 障害の画面を読む人が気にする単位で「どれくらい前か」。起きている間は秒、
 * 過去になったら粗く。時刻が無ければ空文字 — 列は残るので、読みの無い行が
 * 隣の行の並びを崩さない。 */
export function statusAge(at: number | undefined, now: number): string {
  if (at === undefined || !Number.isFinite(at)) return "";
  const seconds = Math.floor(Math.max(0, now - at) / 1000);
  if (seconds < 60) return `${String(seconds)} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)} 分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)} 時間前`;
  return `${String(Math.floor(hours / 24))} 日前`;
}

/** 悪い方から。一目で読むための並びなので、これから効いてくる行が 3 番目に
 * 居てはいけない。`unknown` は `ok` より下 — 分からないことは、分かっている
 * 問題より急がない。同じ severity なら gateway の順 (= 設定の順) のまま。 */
const RANK: Record<LlmStatusSeverity, number> = { critical: 0, warning: 1, ok: 2, unknown: 3 };

export interface ServiceRow {
  readonly id: string;
  readonly name: string;
  readonly tone: StatusTone;
  readonly mark: string;
  readonly severityWords: string;
  readonly routes: readonly string[];
  readonly official?: {
    readonly words: string;
    /** provider の頁を読めてから時間が経ちすぎている。出ているのは最後に
     * 成功した読みで、今の読みではない。 */
    readonly stale: boolean;
    readonly age: string;
    readonly sourceUrl?: string;
    readonly error?: string;
  };
  readonly observed?: {
    readonly words: string;
    readonly age: string;
    /** `HTTP 529` / `transport` — 最後に見えた失敗の形。 */
    readonly failure?: string;
  };
  readonly incidents: readonly LlmStatusIncident[];
}

function failureWords(failure: NonNullable<LlmStatusService["observed"]>["last_failure"]): string {
  if (failure === undefined) return "";
  if (failure.status !== undefined) return `HTTP ${String(failure.status)}`;
  return failure.kind ?? "";
}

export function serviceRows(report: LlmStatusReport, now: number): readonly ServiceRow[] {
  return [...report.services]
    .sort((a, b) => (RANK[a.severity] ?? 3) - (RANK[b.severity] ?? 3))
    .map((service) => {
      const official = service.official;
      const observed = service.observed;
      const failure = observed === undefined ? "" : failureWords(observed.last_failure);
      return {
        id: service.id,
        name: service.name,
        tone: severityTone(service.severity),
        mark: severityMark(service.severity),
        severityWords: severityWords(service.severity),
        routes: service.routes,
        ...(official === undefined
          ? {}
          : {
              official: {
                words: officialWords(official.state),
                stale: official.stale === true,
                age: statusAge(official.observed_at, now),
                ...(official.source_url === undefined ? {} : { sourceUrl: official.source_url }),
                ...(official.error === undefined ? {} : { error: official.error }),
              },
            }),
        ...(observed === undefined
          ? {}
          : {
              observed: {
                words: observedWords(observed.state),
                age: statusAge(observed.observed_at, now),
                ...(failure === "" ? {} : { failure }),
              },
            }),
        incidents: official?.incidents ?? [],
      };
    });
}

/** 接続バーに出す印、または「何も言わない」の undefined。
 *
 * 知っている問題だけが印を得る: `ok` は知らせることが無く、`unknown` で画面を
 * 赤くするのは、status 頁を公開していない provider が 1 つあるだけで全体を
 * 異常に見せることになる。不明は詳細の側で、何が不明なのかを書ける所に置く。 */
export function statusBadge(
  report: LlmStatusReport | undefined,
): { readonly tone: StatusTone; readonly mark: string; readonly words: string } | undefined {
  if (report === undefined) return undefined;
  const severity = report.overall.severity;
  if (severity !== "warning" && severity !== "critical") return undefined;
  return {
    tone: severityTone(severity),
    mark: severityMark(severity),
    words: severityWords(severity),
  };
}

/** `正常 2 / 不明 1` — 1 語に畳んだ verdict が隠している内訳。悪い方から並べ、
 * 1 つも無い severity は書かない。 */
export function severityCounts(report: LlmStatusReport): string {
  const order: LlmStatusSeverity[] = ["critical", "warning", "ok", "unknown"];
  return order
    .filter((severity) => (report.overall.service_counts[severity] ?? 0) > 0)
    .map(
      (severity) => `${severityWords(severity)} ${String(report.overall.service_counts[severity])}`,
    )
    .join(" / ");
}
