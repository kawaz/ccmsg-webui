import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import type { LlmStatsReadResult, LlmUsageCredential, LlmUsageReadResult } from "@ccmsg/protocol";
import {
  type AuthNotice,
  authNotice,
  type BarRow,
  limitLabel,
  limitRows,
  percentWords,
  remainingWords,
  shortDuration,
  snapshotAge,
  supportWords,
  type WindowRow,
  windowRows,
} from "../llm/usage-view.ts";
import { serviceRows, severityCounts, type ServiceRow } from "../llm/status-view.ts";
import {
  type Bucket,
  buckets,
  modelsOf,
  PERIOD_LABELS,
  PERIODS,
  type Period,
  periodDays,
  tokenTotals,
  tokenWords,
  usdWords,
} from "../llm/stats-view.ts";
import { SpendChart } from "./SpendChart.tsx";
import { instanceLabel } from "../instance-label.ts";
import { can, llmStatusReports, navigate, readLlmStats, readLlmUsage, status } from "../state.ts";

/** 時計を進める間隔。残り時間と齢が画面に出ているので、これは「変わったかを
 * 見に行く polling」ではなく時計そのもの — 秒まで出さないので 30 秒で足りる。 */
const TICK_MS = 30_000;

/** クオータを読み直す間隔。読むのは gateway が持っている写しで、upstream には
 * 触らない (触るのは人が押した「更新」だけ)。 */
const RELOAD_MS = 60_000;

/** 使った分と、時計がどこまで来ているかを 1 本に重ねた帯。
 *
 * 目盛りが要るのは、割合だけでは「使い過ぎ」が読めないから: 窓の 2 割しか
 * 過ぎていない時の 50% と、9 割過ぎた時の 50% は別の話で、違いは時計の側に
 * しかない。 */
function Bar({ row }: { row: BarRow }) {
  return (
    <div class={`usage-bar tone-${row.tone}`}>
      <div class="usage-bar-used" style={{ width: `${String(Math.min(100, row.used * 100))}%` }} />
      {row.elapsed !== undefined && (
        <div
          class="usage-bar-elapsed"
          style={{ left: `${String(Math.min(100, row.elapsed * 100))}%` }}
          title="窓のうち過ぎた割合"
        />
      )}
    </div>
  );
}

function Figures({ row }: { row: BarRow }) {
  return (
    <>
      <span class={`usage-used tone-${row.tone}`}>{percentWords(row.used)}</span>
      <span class="usage-left">
        {row.remainingMs === undefined
          ? ""
          : `残り ${remainingWords(row.remainingMs)} / ${shortDuration(row.durationMs)}`}
      </span>
    </>
  );
}

function WindowLine({ row }: { row: WindowRow }) {
  return (
    <div class={row.expired ? "usage-row is-expired" : "usage-row"}>
      <span class="usage-key">{row.key}</span>
      <Bar row={row} />
      <Figures row={row} />
      {row.expired && <span class="usage-note">期限切れの読み</span>}
      {!row.expired && row.status !== "allowed" && <span class="usage-note">{row.status}</span>}
    </div>
  );
}

/** credential 1 つ。窓は gateway が持っている写しから、limit は人が押した
 * 「更新」の答えからしか来ない。 */
function Credential({ credential, now }: { credential: LlmUsageCredential; now: number }) {
  const snapshot = credential.snapshot;
  const notice = authNotice(credential, now);
  const limits = limitRows(credential.limits ?? [], now);
  const age = snapshot === undefined ? undefined : snapshotAge(snapshot, now);
  return (
    <section class="usage-credential">
      <h3>
        {credential.name}
        {credential.type !== undefined && <span class="usage-kind">{credential.type}</span>}
        {age !== undefined && (
          <span class="meta" title="この観測の鮮度">
            {age}
          </span>
        )}
      </h3>
      {notice !== undefined && <AuthLine notice={notice} />}
      {snapshot === undefined ? (
        <p class="empty" title={supportWords(credential.support)}>
          {supportWords(credential.support)}
        </p>
      ) : (
        <div class="usage-rows">
          {windowRows(snapshot, now).map((row) => (
            <WindowLine key={row.key} row={row} />
          ))}
        </div>
      )}
      {limits.length > 0 && (
        <div class="usage-rows">
          {limits.map((row) => (
            <div key={row.key} class="usage-row">
              <span class="usage-key" title={limitLabel(row)}>
                {row.key}
              </span>
              <Bar row={row} />
              <Figures row={row} />
              {(row.model !== undefined || row.active) && (
                <span class="usage-note">
                  {[row.model, row.active ? "計測中" : undefined]
                    .filter((word) => word !== undefined)
                    .join(" / ")}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {credential.snapshot?.overage !== undefined && (
        <p class="meta">
          追加分: {credential.snapshot.overage.status}
          {credential.snapshot.overage.disabled_reason !== undefined &&
            ` — ${credential.snapshot.overage.disabled_reason}`}
        </p>
      )}
      {credential.probe_error !== undefined && (
        <p class="banner">更新できませんでした: {credential.probe_error}</p>
      )}
    </section>
  );
}

function AuthLine({ notice }: { notice: AuthNotice }) {
  return (
    <p class={`usage-auth tone-${notice.tone}`}>
      <span>{notice.label}</span>
      {notice.age !== undefined && <span class="meta">({notice.age})</span>}
      {notice.loginUrl !== undefined && (
        <a href={notice.loginUrl} target="_blank" rel="noreferrer">
          ログインし直す
        </a>
      )}
      {notice.reason !== undefined && <span class="meta">{notice.reason}</span>}
    </p>
  );
}

/** 上流のサービス 1 行。**2 つの signal は混ぜない**: provider 自身の言い分と、
 * この gateway が実際に繋いでみた結果は別のことなので、列を分けて出す。 */
function ServiceLine({ row }: { row: ServiceRow }) {
  return (
    <div class="status-row">
      <span class={`status-mark tone-${row.tone}`} aria-hidden="true">
        {row.mark}
      </span>
      <span class="status-name">{row.name}</span>
      <span class={`status-severity tone-${row.tone}`}>{row.severityWords}</span>
      {row.official !== undefined && (
        <span class="status-official">
          {row.official.sourceUrl === undefined ? (
            row.official.words
          ) : (
            <a href={row.official.sourceUrl} target="_blank" rel="noreferrer">
              {row.official.words}
            </a>
          )}
          <span class="meta">
            {row.official.stale ? "古い読み" : row.official.age}
            {row.official.error !== undefined && ` / ${row.official.error}`}
          </span>
        </span>
      )}
      {row.observed !== undefined && (
        <span class="status-observed">
          {row.observed.words}
          <span class="meta">
            {row.observed.failure === undefined
              ? row.observed.age
              : `${row.observed.failure} / ${row.observed.age}`}
          </span>
        </span>
      )}
      {row.incidents.length > 0 && (
        <ul class="status-incidents">
          {row.incidents.map((one) => (
            <li key={one.id ?? one.name}>
              {one.url === undefined ? (
                one.name
              ) : (
                <a href={one.url} target="_blank" rel="noreferrer">
                  {one.name}
                </a>
              )}
              {one.latest_update !== undefined && <span class="meta">{one.latest_update}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 何にいくら使ったか。
 *
 * 読む単位 (日 / 週 / 月) を変えると、gateway に聞き直す — 束の作り方だけを
 * 変えても、月別を埋めるには日ごとの記録がもっと要る。 */
function Spend() {
  const period = useSignal<Period>("daily");
  const stats = useSignal<LlmStatsReadResult | undefined>(undefined);
  const problem = useSignal<string | undefined>(undefined);
  const held = period.value;

  useEffect(() => {
    let live = true;
    readLlmStats(periodDays(held))
      .then((read) => {
        if (live) stats.value = read;
      })
      .catch((cause: unknown) => {
        if (live) problem.value = String(cause);
      });
    return () => {
      live = false;
    };
  }, [held, stats, problem]);

  const read = stats.value;
  const rows: readonly Bucket[] = read === undefined ? [] : buckets(read, held);
  const models = modelsOf(rows);
  const tokens = read === undefined ? undefined : tokenTotals(read);

  return (
    <div class="usage-block">
      <h3>
        費用
        <span class="usage-periods">
          {PERIODS.map((one) => (
            <button
              key={one}
              type="button"
              class={one === held ? "on" : undefined}
              aria-pressed={one === held}
              onClick={() => {
                period.value = one;
              }}
            >
              {PERIOD_LABELS[one]}
            </button>
          ))}
        </span>
      </h3>
      {problem.value !== undefined && <p class="banner">{problem.value}</p>}
      {read === undefined ? (
        <p class="empty">読み込んでいます…</p>
      ) : rows.length === 0 ? (
        <p class="empty">gateway はこの範囲の費用を持っていません。</p>
      ) : (
        <>
          <SpendChart rows={rows} models={models} />
          <p class="spend-legend">
            {models.map((model, at) => (
              <span key={model}>
                <span class={`spend-swatch tone-${String(at % 6)}`} aria-hidden="true" />
                {model}
              </span>
            ))}
          </p>
          <div class="usage-rows">
            {rows.slice(0, 14).map((row) => (
              <div key={row.key} class="usage-row spend-row">
                <span class="usage-key">{row.key}</span>
                <span class="spend-models">
                  {row.models
                    .filter((part) => part.usd > 0)
                    .map((part) => `${part.model} ${usdWords(part.usd)}`)
                    .join(" / ")}
                </span>
                <span class="usage-used">{usdWords(row.usd)}</span>
              </div>
            ))}
          </div>
          {tokens !== undefined && (
            <p class="meta">
              {tokens.requests.toLocaleString()} 回 / 入 {tokenWords(tokens.input)} · 出{" "}
              {tokenWords(tokens.output)} · cache 書 {tokenWords(tokens.cacheWrite)} · cache 読{" "}
              {tokenWords(tokens.cacheRead)}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** 上流の様子と、credential ごとのクオータ。
 *
 * 上流を先に置くのは、数字が動かなくなった時に最初に問われるのがそこだから —
 * 下のクオータの読み方も、上流が落ちているかどうかで変わる。 */
export function Usage() {
  const now = useSignal(Date.now());
  const usage = useSignal<LlmUsageReadResult | undefined>(undefined);
  const problem = useSignal<string | undefined>(undefined);
  const probing = useSignal(false);
  const open = status.value === "open";
  const hasUsage = can("llm_usage");
  const hasStatus = can("llm_status");

  useEffect(() => {
    if (!open || !hasUsage) return;
    let live = true;
    const read = (refresh: boolean): void => {
      readLlmUsage(refresh)
        .then((result) => {
          if (!live) return;
          usage.value = result;
          problem.value = undefined;
          now.value = Date.now();
        })
        .catch((cause: unknown) => {
          // 繋ぎ直しの最中に閉じた socket は、画面に出ているものを消す理由に
          // ならない (出ているものは齢を名乗っている)。
          if (live) problem.value = String(cause);
        });
    };
    read(false);
    const reload = setInterval(() => {
      read(false);
    }, RELOAD_MS);
    const tick = setInterval(() => {
      now.value = Date.now();
    }, TICK_MS);
    return () => {
      live = false;
      clearInterval(reload);
      clearInterval(tick);
    };
  }, [open, hasUsage, usage, problem, now]);

  const probe = (): void => {
    probing.value = true;
    readLlmUsage(true)
      .then((result) => {
        usage.value = result;
        problem.value = undefined;
        now.value = Date.now();
      })
      .catch((cause: unknown) => {
        problem.value = String(cause);
      })
      .finally(() => {
        probing.value = false;
      });
  };

  const reports = llmStatusReports.value;
  const credentials = usage.value?.credentials ?? [];

  return (
    <section class="section usage">
      <h2>使用量</h2>
      {!hasUsage && !hasStatus && (
        <p class="empty">この instance には LLM gateway が設定されていません。</p>
      )}
      {hasStatus && (
        <div class="usage-block">
          <h3>上流のサービス</h3>
          {reports.length === 0 ? (
            <p class="empty">gateway からの報告はまだ届いていません。</p>
          ) : (
            reports.map((slot) => (
              <div key={slot.instance} class="status-report">
                {reports.length > 1 && (
                  <p class="meta">{instanceLabel(slot.instance, undefined)}</p>
                )}
                <p class="meta">{severityCounts(slot.data)}</p>
                {serviceRows(slot.data, now.value).map((row) => (
                  <ServiceLine key={row.id} row={row} />
                ))}
              </div>
            ))
          )}
        </div>
      )}
      {hasUsage && (
        <div class="usage-block">
          <h3>
            クオータ
            <button type="button" disabled={probing.value || !open} onClick={probe}>
              {probing.value ? "更新中…" : "更新"}
            </button>
            <span
              class="meta"
              title="「更新」は upstream に問い合わせ直します (rate limit を使います)"
            >
              更新は upstream に聞き直します
            </span>
          </h3>
          {problem.value !== undefined && <p class="banner">{problem.value}</p>}
          {credentials.length === 0 ? (
            <p class="empty">
              {problem.value === undefined
                ? "gateway は credential を 1 つも報告していません。"
                : ""}
            </p>
          ) : (
            credentials.map((credential) => (
              <Credential key={credential.name} credential={credential} now={now.value} />
            ))
          )}
        </div>
      )}
      {can("llm_stats") && <Spend />}
      <p class="auth-actions">
        <button
          type="button"
          onClick={() => {
            navigate({ at: "sessions" });
          }}
        >
          一覧に戻る
        </button>
      </p>
    </section>
  );
}
