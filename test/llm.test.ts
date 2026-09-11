import { describe, expect, test } from "bun:test";
import type { LlmRequestInfo, LlmStatusReport, LlmUsageSnapshot } from "@ccmsg/protocol";
import {
  cacheRemainingMs,
  cacheRingSpan,
  cacheRingStyle,
  sessionCacheWindows,
} from "../src/llm/cache-ring.ts";
import {
  authNotice,
  limitRows,
  percentWords,
  remainingWords,
  severityTone,
  shortDuration,
  windowRows,
} from "../src/llm/usage-view.ts";
import { serviceRows, severityCounts, statusBadge, statusAge } from "../src/llm/status-view.ts";

const NOW = 1_800_000_000_000;
const SID = "11111111-2222-4333-8444-555555555555";

function request(extra: Partial<LlmRequestInfo> = {}): LlmRequestInfo {
  return {
    received_at: NOW,
    sid: SID,
    instance: "00112233445566778899aabbccddeeff",
    main: true,
    ...extra,
  } as LlmRequestInfo;
}

describe("cache の輪が掃く範囲", () => {
  test("窓 1 つなら、その窓の始まりから終わりまで", () => {
    const span = cacheRingSpan(request({ cache_expires_at: NOW + 300_000 }), NOW + 60_000);
    expect(span).toEqual({ phase: "window", start: NOW, end: NOW + 300_000 });
  });

  test("合図の予定があれば、最初の輪はそこで終わる (機械が会話から引き継ぐ所)", () => {
    const span = cacheRingSpan(
      request({ cache_expires_at: NOW + 3_600_000, next_keepalive_at: NOW + 3_300_000 }),
      NOW,
    );
    expect(span?.end).toBe(NOW + 3_300_000);
  });

  test("連なりが走っていれば、連なりぜんぶを 1 周として別の色で掃く", () => {
    const span = cacheRingSpan(
      request({
        received_at: NOW + 3_300_000,
        cache_expires_at: NOW + 6_900_000,
        cache_since_at: NOW,
        cache_count: 1,
        cache_until_at: NOW + 20_000_000,
      }),
      NOW + 3_400_000,
    );
    expect(span).toEqual({ phase: "extended", start: NOW, end: NOW + 20_000_000 });
  });

  test("合図が止まっていれば、予測ではなく窓そのものを掃く", () => {
    const span = cacheRingSpan(
      request({
        cache_expires_at: NOW + 300_000,
        cache_since_at: NOW - 600_000,
        cache_count: 2,
        cache_until_at: NOW + 20_000_000,
        cache_paused: true,
      }),
      NOW,
    );
    expect(span).toEqual({ phase: "window", start: NOW, end: NOW + 300_000 });
  });

  test("窓が閉じていれば何も描かない — 予測がどれだけ先を指していても", () => {
    const cold = request({
      received_at: NOW - 600_000,
      cache_expires_at: NOW - 1,
      cache_since_at: NOW - 600_000,
      cache_count: 3,
      cache_until_at: NOW + 20_000_000,
    });
    expect(cacheRingSpan(cold, NOW)).toBeUndefined();
    expect(cacheRingStyle(cold, NOW)).toBeUndefined();
    expect(cacheRemainingMs(cold, NOW)).toBe(0);
  });

  test("何も cache しなかった要求 (出所を名乗り、期限を言わない) は窓を持たない", () => {
    expect(cacheRingSpan(request({ origin: "main" }), NOW)).toBeUndefined();
  });

  test("期限も出所も無ければ、両側が同じ長さを仮定する", () => {
    expect(cacheRemainingMs(request(), NOW)).toBe(300_000);
  });

  test("輪の style は、始まりを負の delay で指し、一周を窓の長さにする", () => {
    const style = cacheRingStyle(request({ cache_expires_at: NOW + 300_000 }), NOW + 60_000);
    expect(style?.style["--cache-ring-duration"]).toBe("300s");
    expect(style?.style["--cache-ring-delay"]).toBe("-60s");
    expect(style?.class).toContain("cache-ring");
    expect(style?.class).not.toContain("extended");
  });

  test("範囲が変われば animation の名前も変わる (変わった時にだけ輪は回り直す)", () => {
    const first = cacheRingStyle(request({ cache_expires_at: NOW + 300_000 }), NOW);
    const later = cacheRingStyle(request({ cache_expires_at: NOW + 301_000 }), NOW);
    expect(first?.class).not.toBe(later?.class);
  });
});

describe("セッションごとに輪を 1 つ選ぶ", () => {
  test("そのセッション自身の系列が worker の系列に優先する", () => {
    const chosen = sessionCacheWindows([
      request({ main: false, prefix: "worker", cache_expires_at: NOW + 9_000_000 }),
      request({ main: true, prefix: "own", cache_expires_at: NOW + 300_000 }),
    ]);
    expect(chosen.get(SID)?.prefix).toBe("own");
  });

  test("自身の系列が無ければ、最も遅くまで生きている窓", () => {
    const chosen = sessionCacheWindows([
      request({ main: false, prefix: "a", cache_expires_at: NOW + 300_000 }),
      request({ main: false, prefix: "b", cache_expires_at: NOW + 900_000 }),
    ]);
    expect(chosen.get(SID)?.prefix).toBe("b");
  });
});

function snapshot(windows: LlmUsageSnapshot["windows"]): LlmUsageSnapshot {
  return { windows };
}

describe("クオータの窓", () => {
  test("短い窓から並ぶ — gateway が並べた順に関わらず", () => {
    const rows = windowRows(
      snapshot({
        "7d": { utilization: 0.1, status: "allowed", reset_at: NOW + 86_400_000 },
        "5h": { utilization: 0.1, status: "allowed", reset_at: NOW + 3_600_000 },
      }),
      NOW,
    );
    expect(rows.map((row) => row.key)).toEqual(["5h", "7d"]);
  });

  test("時計より目に見えて先行していれば注意色", () => {
    // 5h の窓が 1h 残り = 8 割経過。9 割使っていれば先行している。
    const [row] = windowRows(
      snapshot({ "5h": { utilization: 0.9, status: "allowed", reset_at: NOW + 3_600_000 } }),
      NOW,
    );
    expect(row?.elapsed).toBeCloseTo(0.8, 5);
    expect(row?.overPace).toBe(true);
    expect(row?.tone).toBe("warn");
  });

  test("少し先行しているだけでは色を変えない (むらは普通のこと)", () => {
    const [row] = windowRows(
      snapshot({ "5h": { utilization: 0.83, status: "allowed", reset_at: NOW + 3_600_000 } }),
      NOW,
    );
    expect(row?.overPace).toBe(false);
    expect(row?.tone).toBe("ok");
  });

  test("upstream が断っていれば、速さに関わらず異常色", () => {
    const [row] = windowRows(snapshot({ "5h": { utilization: 1.2, status: "rejected" } }), NOW);
    expect(row?.tone).toBe("bad");
  });

  test("終わった期間の読みには色を付けず、そう言うだけ", () => {
    const [row] = windowRows(
      snapshot({ "5h": { utilization: 1.4, status: "rejected", expired: true } }),
      NOW,
    );
    expect(row?.expired).toBe(true);
    expect(row?.tone).toBe("ok");
  });

  test("長さは upstream の申告が先で、窓の名前は後", () => {
    const [row] = windowRows(
      snapshot({
        primary: {
          utilization: 0.5,
          status: "allowed",
          reset_at: NOW + 1_800_000,
          window_secs: 3600,
        },
      }),
      NOW,
    );
    expect(row?.durationMs).toBe(3_600_000);
    expect(row?.elapsed).toBeCloseTo(0.5, 5);
  });
});

describe("provider の limit", () => {
  test("percent は 0..100 で届き、帯の 0..1 に直る", () => {
    const [row] = limitRows([{ kind: "session", percent: 47, severity: "normal" }], NOW);
    expect(row?.used).toBeCloseTo(0.47, 5);
  });

  test("upstream の verdict が勝ち、速さはそれを下げない", () => {
    const [row] = limitRows(
      [{ kind: "weekly_total", percent: 10, severity: "critical", resets_at: NOW + 1000 }],
      NOW,
    );
    expect(row?.tone).toBe("bad");
  });

  test("知らない severity は色を付けない (語彙は gateway が増やす)", () => {
    expect(severityTone("something-new")).toBe("ok");
  });
});

describe("数字の綴り", () => {
  test("1 日未満は時分、それ以上は日時", () => {
    expect(remainingWords(3_600_000 + 29 * 60_000)).toBe("1h29m");
    expect(remainingWords(2 * 86_400_000 + 2 * 3_600_000)).toBe("02d02h");
  });

  test("期間は窓の名前と同じ綴りで書く", () => {
    expect(shortDuration(5 * 3_600_000)).toBe("5h");
    expect(shortDuration(7 * 86_400_000)).toBe("7d");
    expect(shortDuration(undefined)).toBe("");
  });

  test("割合は整数の百分率", () => {
    expect(percentWords(0.476)).toBe("48%");
  });
});

describe("credential の認証", () => {
  test("再ログインが要る時だけ、ブラウザで押せる入口を添える", () => {
    const notice = authNotice(
      {
        name: "one",
        support: "observed",
        auth: { status: "relogin_required", reason: "token expired", login_url: "https://h/login" },
      },
      NOW,
    );
    expect(notice?.tone).toBe("bad");
    expect(notice?.loginUrl).toBe("https://h/login");
  });

  test("知らない status では何も言わない", () => {
    expect(
      authNotice({ name: "one", support: "observed", auth: { status: "fine" } }, NOW),
    ).toBeUndefined();
  });
});

function report(
  services: LlmStatusReport["services"],
  overall: LlmStatusReport["overall"],
): LlmStatusReport {
  return { overall, services };
}

describe("上流の報告", () => {
  const services: LlmStatusReport["services"] = [
    { id: "a", name: "A", severity: "ok", routes: [] },
    { id: "b", name: "B", severity: "critical", routes: [] },
    { id: "c", name: "C", severity: "unknown", routes: [] },
    { id: "d", name: "D", severity: "warning", routes: [] },
  ];

  test("悪い方から並び、不明は正常より下", () => {
    const rows = serviceRows(report(services, { severity: "critical", service_counts: {} }), NOW);
    expect(rows.map((row) => row.id)).toEqual(["b", "d", "a", "c"]);
  });

  test("印は色とは別に持つ (色が読めなくても分かるように)", () => {
    const rows = serviceRows(report(services, { severity: "critical", service_counts: {} }), NOW);
    expect(rows[0]?.mark).toBe("■");
    expect(rows[0]?.tone).toBe("bad");
  });

  test("バーの印は、知っている問題がある時だけ出る", () => {
    expect(statusBadge(report([], { severity: "ok", service_counts: { ok: 3 } }))).toBeUndefined();
    expect(
      statusBadge(report([], { severity: "unknown", service_counts: { unknown: 1 } })),
    ).toBeUndefined();
    expect(
      statusBadge(report([], { severity: "warning", service_counts: { warning: 1 } }))?.words,
    ).toBe("注意");
  });

  test("内訳は悪い方から、居ない severity は書かない", () => {
    expect(
      severityCounts(report([], { severity: "warning", service_counts: { ok: 2, warning: 1 } })),
    ).toBe("注意 1 / 正常 2");
  });

  test("齢は、起きている間は秒、過去になったら粗く", () => {
    expect(statusAge(NOW - 5_000, NOW)).toBe("5 秒前");
    expect(statusAge(NOW - 5 * 60_000, NOW)).toBe("5 分前");
    expect(statusAge(undefined, NOW)).toBe("");
  });
});
