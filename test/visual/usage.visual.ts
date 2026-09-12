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

test("費用は読む単位ごとに束ね直され、model で積んだ棒になる", async ({
  usage: page,
  instance,
}) => {
  await page.goto(`${instance.endpoint}usage`);
  await expect(page.getByRole("heading", { name: /費用/ })).toBeVisible();
  // 日別の束。gateway が日ごとに言った合計がそのまま行になる。
  await expect(page.locator(".spend-row").first()).toBeVisible();
  await expect(page.locator(".spend-chart .spend-part").first()).toBeVisible();
  // 凡例は画面に出ている model を、多い順に。
  await expect(page.locator(".spend-legend")).toContainText("claude-opus-5");
  await shot(page, "usage-spend.png");

  // 単位を変えると聞き直して束ね直す (月別は日ごとの記録がもっと要る)。
  await page.getByRole("button", { name: "月別" }).click();
  await expect(page.locator(".spend-row").first().locator(".usage-key")).toHaveText(
    /^\d{4}-\d{2}$/,
  );
});

test("「更新」で upstream に聞き直すと、limit が並ぶ", async ({ usage: page, instance }) => {
  await page.goto(`${instance.endpoint}usage`);
  await expect(page.getByText("claude-one")).toBeVisible();
  await expect(page.getByText("weekly_scoped")).toBeHidden();
  await page.getByRole("button", { name: "更新" }).click();
  await expect(page.getByText("weekly_scoped")).toBeVisible();
  // 枠が絞られている model は、行を伸ばさずに注記の側で言う。
  // 枠が絞られている model は、行を伸ばさずに注記の側で言う (費用の行にも同じ
  // 名前が並ぶので、どちらの注記かを名指す)。
  await expect(page.locator(".usage-note", { hasText: "claude-opus-5" }).first()).toBeVisible();
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

/** 切断の 2 つの顔。撮らずに DOM で見る: 「消えた」は絵にすると「何も無い
 * 画面」で、繋がっていて中身が空なのか、話し相手が居ないのかを区別できない。 */
test("回線が切れただけなら、聞いたものは帯付きで残る", async ({ usage: page, instance }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  // socket を中継して、**網が落ちている間**を作れるようにする。切るだけでは
  // 足りない: 画面は 500ms 後に繋ぎ直しに行くので、切断の姿はその間しか無く、
  // 見に行った時にはもう戻っている (実測 509ms)。落ちている状態を保つには、
  // 繋ぎ直しに来た socket も断り続ける必要がある。
  let down = false;
  let drop: (() => void) | undefined;
  await page.routeWebSocket(/\/ws$/, (ws) => {
    if (down) {
      // 網の向こうに誰も居ない。繋ぎ直しはここで断られ、画面は切れたまま。
      ws.close();
      return;
    }
    const instanceSide = ws.connectToServer();
    ws.onMessage((message) => {
      instanceSide.send(message);
    });
    instanceSide.onMessage((message) => {
      ws.send(message);
    });
    drop = () => {
      instanceSide.close();
    };
  });
  await page.goto(instance.endpoint);
  await expect(page.locator(".row").first()).toBeVisible();
  expect(drop).toBeDefined();

  // 人は何も押していない。端末が網から外れただけ。
  down = true;
  drop?.();
  await expect(page.locator(".stale-band")).toBeVisible();
  // 行は残ったまま: 切れただけの端末から、最後に聞いた内容まで消さない。
  await expect(page.locator(".row").first()).toBeVisible();

  // 網が戻れば、繋ぎ直した snapshot が同じ行を置き換えて帯が消える。
  down = false;
  await expect(page.locator(".stale-band")).toBeHidden({ timeout: 30_000 });
  await expect(page.locator(".row").first()).toBeVisible();
  await page.unrouteAll();
});

test("人が切断したら持ち物ごと畳み、繋ぎ直すと snapshot で戻る", async ({
  usage: page,
  instance,
}) => {
  await page.goto(instance.endpoint);
  await expect(page.locator(".row").first()).toBeVisible();

  await page.getByRole("button", { name: "切断" }).click();
  await expect(page.locator(".row")).toHaveCount(0);
  await expect(page.locator(".row")).toHaveCount(0);

  await page.getByRole("button", { name: "接続" }).click();
  await expect(page.getByRole("heading", { name: /^instance / })).toBeVisible();
  await expect(page.locator(".row").first()).toBeVisible();
});
