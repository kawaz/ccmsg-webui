import { createServer, type Server } from "node:http";

/** 使い捨ての LLM gateway。
 *
 * daemon の向こう側に本物の gateway を置く代わりに、gateway 自身の綴りで書いた
 * 2 つの文書をここから答える。**daemon の読み替えはそのまま通る** ので、画面に
 * 出るのは契約の形に直された後のもの — 作り物なのは「gateway が何を言ったか」
 * だけで、そこから先は本番と同じ道を通る。
 *
 * 時刻は全て `base` からの差で書く。画面に出るのは残り時間と齢なので、走った
 * 時刻そのものが基準画像に写ってはいけない: 呼ぶ側がページの時計も同じ `base`
 * に留めることで、何度撮っても同じ文字になる。 */

const HOUR = 3_600_000;
const MINUTE = 60_000;

export interface StubGateway {
  readonly url: string;
  stop(): Promise<void>;
}

/** credential ごとのクオータ。`refresh` を付けて聞かれた時だけ limit を足す —
 * 本物の gateway でもそこは upstream に聞き直した時にしか埋まらない。 */
function usageDocument(base: number, refresh: boolean): unknown {
  return {
    generated_at: base - MINUTE,
    credentials: [
      {
        name: "claude-one",
        type: "oauth",
        support: "observed",
        snapshot: {
          observed_at: base - 3 * MINUTE,
          // gateway の綴り: `reset` と `window_seconds` (契約側は `reset_at` と
          // `window_secs`)。
          "5h": {
            utilization: 0.62,
            status: "allowed",
            reset: base + 2 * HOUR,
            window_seconds: 5 * 3600,
          },
          "7d": {
            utilization: 0.91,
            status: "allowed_warning",
            reset: base + 3 * 24 * HOUR,
            window_seconds: 7 * 24 * 3600,
          },
        },
        ...(refresh
          ? {
              limits: [
                {
                  kind: "session",
                  percent: 62,
                  severity: "normal",
                  resets_at: base + 2 * HOUR,
                  is_active: true,
                },
                {
                  kind: "weekly_scoped",
                  percent: 91,
                  severity: "warning",
                  resets_at: base + 3 * 24 * HOUR,
                  model: "claude-opus-5",
                },
              ],
            }
          : {}),
      },
      {
        name: "claude-two",
        type: "api_key",
        support: "observed",
        auth: {
          status: "relogin_required",
          reason: "the stored token no longer authenticates",
          observed_at: base - 40 * MINUTE,
          login_path: "/llm-gateway/login",
        },
        snapshot: {
          observed_at: base - 40 * MINUTE,
          "5h": { utilization: 1.04, status: "rejected", reset: base - 5 * MINUTE, expired: true },
        },
      },
      { name: "vertex", type: "service_account", support: "upstream_dependent" },
    ],
  };
}

/** 上流のサービス。2 つの signal (provider 自身の言い分と、この gateway が
 * 繋いでみた結果) が両方載る形にしてある。 */
function statusDocument(base: number): unknown {
  return {
    schema_version: 1,
    generated_at: base - MINUTE,
    overall: { severity: "warning", service_counts: { ok: 1, warning: 1, unknown: 1 } },
    services: [
      {
        id: "anthropic",
        name: "Anthropic API",
        severity: "warning",
        routes: ["claude-one", "claude-two"],
        official: {
          state: "degraded",
          source: "statuspage",
          source_url: "https://status.example/anthropic",
          observed_at: base - 2 * MINUTE,
          components: [{ id: "api", name: "API", state: "degraded" }],
          incidents: [
            {
              id: "inc-1",
              name: "Elevated error rates on the Messages API",
              state: "monitoring",
              impact: "minor",
              updated_at: base - 6 * MINUTE,
              url: "https://status.example/incidents/inc-1",
              latest_update: "A fix has been applied and we are monitoring the result.",
            },
          ],
        },
        observed: {
          state: "failing",
          observed_at: base - 30_000,
          last_failure: { at: base - 30_000, kind: "http", status: 529 },
        },
      },
      {
        id: "bedrock",
        name: "Amazon Bedrock",
        severity: "ok",
        routes: ["vertex"],
        official: {
          state: "operational",
          observed_at: base - 4 * MINUTE,
          components: [],
          incidents: [],
        },
        observed: { state: "reachable", observed_at: base - 45_000 },
      },
      {
        id: "openai",
        name: "OpenAI",
        severity: "unknown",
        routes: [],
        official: {
          state: "unknown",
          observed_at: base - 3 * HOUR,
          stale: true,
          components: [],
          incidents: [],
          error: "the status page could not be read",
        },
      },
    ],
  };
}

/** 日ごとの費用。gateway の綴りで、日付は gateway 自身の時間帯の `YYYY-MM-DD`。
 * 走った日から遡って書くので、束の作り方 (日 / 週 / 月) が絵に出る。 */
function statsDocument(base: number, days: number): unknown {
  const out: Record<string, unknown> = {};
  for (let back = 0; back < Math.min(days, 40); back += 1) {
    const at = new Date(base - back * 24 * HOUR);
    const key = at.toISOString().slice(0, 10);
    // 数字は**何日前か**から作る。日付そのものから作ると、走らせた日によって
    // 棒の高さが変わり、基準画像が翌日には合わなくなる。
    const seed = (back % 7) + 1;
    out[key] = {
      total_usd: 1.5 * seed,
      credentials: {
        "claude-one": {
          "claude-opus-5": {
            requests: 12 * seed,
            input_tokens: 40_000 * seed,
            output_tokens: 6_000 * seed,
            cache_creation_input_tokens: 20_000 * seed,
            cache_read_input_tokens: 300_000 * seed,
            usd: 1.1 * seed,
          },
          "claude-sonnet-5": { requests: 4 * seed, input_tokens: 9_000 * seed, usd: 0.3 * seed },
        },
      },
    };
  }
  return { generated_at: base - MINUTE, days: out };
}

/** 走らせる。答えるのは gateway が公開している道だけで、他は 404。 */
export function startGateway(port: number, base: number): Promise<StubGateway> {
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const answer = (value: unknown): void => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(value));
    };
    if (url.pathname === "/llm-gateway/usage") {
      answer(usageDocument(base, url.searchParams.get("refresh") === "true"));
      return;
    }
    if (url.pathname === "/llm-gateway/stats") {
      answer(statsDocument(base, Number(url.searchParams.get("days") ?? "32")));
      return;
    }
    if (url.pathname === "/llm-gateway/status") {
      answer(statusDocument(base));
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });
  return new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", () => {
      done({
        url: `http://127.0.0.1:${String(port)}`,
        stop: () =>
          new Promise<void>((closed) => {
            server.close(() => {
              closed();
            });
          }),
      });
    });
  });
}
