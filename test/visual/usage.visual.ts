import { SID } from "./fixture.ts";
import { expect, nothingOverflows, shot, test } from "./harness.ts";

/** 上流とクオータの画面、そして prompt cache の輪。
 *
 * 本物の道を通す: 使い捨ての gateway (`gateway.ts`) が gateway 自身の綴りで
 * 答え、daemon がそれを契約の形に読み替え、画面はその答えを描く。作り物なのは
 * 「gateway が何を言ったか」だけ。
 *
 * 名前が `screens` の後ろに来るのは順番のため: 輪を出すために gateway の
 * 要求を 1 件流すので、一覧を撮る側より後ろに居る必要がある。 */

test("上流とクオータが 1 枚に出る", async ({ usage: page, instance }) => {
  await page.goto(`${instance.endpoint}usage`);
  await expect(page.getByRole("heading", { name: "使用量" })).toBeVisible();
  // 上流は topic で届く (購読した時点の報告がそのまま snapshot として来る)。
  await expect(page.getByText("Anthropic API")).toBeVisible();
  await expect(page.getByText("claude-one")).toBeVisible();
  // 窓は短い方から。7d は upstream 自身が注意と言っている。
  await expect(page.getByText("91%")).toBeVisible();
  await shot(page, "usage.png");
});

test("「更新」で upstream に聞き直すと、limit が並ぶ", async ({ usage: page, instance }) => {
  await page.goto(`${instance.endpoint}usage`);
  await expect(page.getByText("claude-one")).toBeVisible();
  await expect(page.getByText("weekly_scoped")).toBeHidden();
  await page.getByRole("button", { name: "更新" }).click();
  await expect(page.getByText("weekly_scoped")).toBeVisible();
  // 枠が絞られている model は、行を伸ばさずに注記の側で言う。
  await expect(
    page.getByText("claude-opus-5 / 計測中").or(page.getByText("claude-opus-5")),
  ).toBeVisible();
  await shot(page, "usage-probed.png");
});

test("cache が生きているセッションの行に輪が重なる", async ({ usage: page, instance }) => {
  const base = instance.gatewayBase;
  // gateway が見た 1 件。窓は 1 時間で、合図の予定も projection も載せない —
  // 会話が作った最初の cache がそのまま回っている状態。
  await instance.llmEvent({
    ts: base,
    session_id: SID,
    ns: "visual",
    model: "claude-opus-5",
    credential: "claude-one",
    status: 200,
    prefix: "2cf24dba",
    origin: "main",
    cache_ttl_secs: 3600,
    cache_expires_at: base + 3_600_000,
    cache_paused: false,
    cache_since: base,
    cache_count: 0,
  });
  await page.goto(instance.endpoint);
  await expect(page.getByRole("heading", { name: /^instance / })).toBeVisible();
  await expect(page.locator(".cache-ring-svg").first()).toBeVisible();
  // 輪そのものが animation なので、この 1 枚だけは動いたまま撮る。
  await shot(page, "sessions-cache-ring.png", { animations: "allow" });
});

/** 手のひらの幅で読んだ使用量。**この file の最後に置く**: 窓の大きさは文脈に
 * 付くので、狭くしたまま次の画面を撮らせないため (撮る順は file の並び順)。 */
test("狭い画面でも、帯と数字が窓に収まる", async ({ usage: page, instance }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(`${instance.endpoint}usage`);
  await expect(page.getByText("claude-one")).toBeVisible();
  await nothingOverflows(page);
  await shot(page, "phone-usage.png");
});
