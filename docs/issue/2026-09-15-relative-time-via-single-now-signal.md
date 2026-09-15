---
title: TL の相対時刻は 1 本の now signal で更新し、見えている item だけが購読する
status: open
category: design
created: 2026-09-15T12:53:24+09:00
last_read:
open_entered: 2026-09-15T12:53:24+09:00
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

# TL の相対時刻は 1 本の now signal で更新し、見えている item だけが購読する

## 概要

TL の各メッセージ / item に相対時刻 (3m12s 等) を出す時、各コンポーネントが `Date.now()` と自前の `setInterval` を持つ形にせず、`now` signal を 1 本作ってそれを読む。

## 背景

kawaz 2026-09-15。

### 設計

- tick を配る signal は 1 つ (タイマー 1 つ)。値は「表示に効く粒度に丸めた時刻」(1 分未満の item は秒、それ以降は分) にし、値が変わらない tick では再描画が起きないようにする
- `IntersectionObserver` で見えている item だけが `now` を購読し、見えなくなったら解除する (長い TL で効く)
- test では signal の値を固定する。visual test の時刻固定は Playwright の `page.clock` (アプリ内の配り方とは別の層、issue `visual-mask-box-dimension-drift`)

### 懸念

粒度の丸めが無いと、見えている数百 item が毎秒再描画になる。丸め + visible 限定は必須。

## 粒度ごとの signal (kawaz 2026-09-15)

- signal は粒度ごとに分ける: `now10s` / `now1m` / `now1h` / `now1d` (実体はタイマー 1 本から丸めて派生)。各 item は自分の経過時間から粒度を決めてその signal だけを読み、閾値をまたいだら (自分の signal の次の tick で) 読む signal を切り替える。切り替え時に 1 回だけ再描画、以後は粗い tick でしか動かない
- 表示例: 10 分未満は `3m10s` (10 秒刻み)、10 分以上は `12m`、1 時間以上は `1h40m`、1 日以上は `2d5h`
- 秒の粒度は **10 秒 tick** で十分。1 秒刻みは気が散るだけで、TL の用途 (どのくらい前か) には要らない。表示も 10 秒に丸めるので tick と表示の粒度が一致する

## 受け入れ条件

- [ ] TL に相対時刻が出て、時間経過で更新される。タイマーは 1 つ
- [ ] 画面外の item は購読していない (test: observer で不可視にした item が tick で再描画されない)
- [ ] unit test で `now` を固定して相対時刻の文字列を検査できる

## TODO

<!-- wip 時のみ -->
