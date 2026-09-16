---
title: visual の inbox 画面が全体走行で 1 度だけ pixel 差で落ちた (単体・次の全体走行では再現せず)
status: open
category: bug
created: 2026-09-16T16:43:33+09:00
last_read:
open_entered: 2026-09-16T16:43:33+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin:
---

# visual の inbox 画面が全体走行で 1 度だけ pixel 差で落ちた (単体・次の全体走行では再現せず)

## 概要

2026-09-16、契約 v2.2.0 追従作業中の `just visual` 全体走行で `[light] test/visual/inbox.visual.ts:31 待っている 1 通は、言われた時刻の所に印付きで並ぶ` が 1 度だけ pixel 差で落ちた。同じ test を単体で回すと通り (`bun x playwright test inbox.visual.ts:31 --project=light` → 1 passed)、直後の全体走行も 102 passed で通った。

**flaky と断じていない。調査未完了**として残す。

## 観測できたこと / できなかったこと

- 観測できた: 全体走行 3 回のうち 1 回で 1 画面だけ失敗。失敗したのは light の inbox のみ (dark は通過)
- 観測できなかった: **diff 画像を残せなかった** — 原因切り分けのために単体再実行したことで `test-results/` が上書きされた。差分が何 px でどこだったかは不明
- そのため真因の仮説も立てられていない (時刻表示の丸め・待っている印の描画順・snapshot の 1 フレーム遅れ、いずれも根拠なし)

## 次にやること

- 再発したら**まず diff 画像を退避**してから切り分ける (`test-results/inbox.visual.ts-*/` を `/tmp` へ)
- 落ちた画面が時刻に依存する表示を持つので、`now` の固定 (`src/now.ts` / harness の `gatewayBase`) が inbox の行にも効いているかを確認する

## 関連

- `test/visual/inbox.visual.ts`
- 同種の「1 回だけ」系: `docs/issue/2026-09-11-anchor-snapshot-one-frame-stale.md` (Timeline の錨。本件と同じ原因とは限らない)
