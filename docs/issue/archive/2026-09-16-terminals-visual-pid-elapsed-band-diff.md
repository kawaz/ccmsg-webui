---
title: terminals visual test が pid/経過時刻の帯で閾値超え diff を出す
status: resolved
category: bug
created: 2026-09-16T09:58:55+09:00
last_read:
open_entered: 2026-09-16T09:58:55+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered: 2026-09-16T11:36:48+09:00
discard_reason:
pending_reason:
close_reason: ["done: commit 55edbf81 — .run-when/.run-pid の幅固定 (screenshot.css 140px/100px)、Asia/Bangkok 1桁時刻で再現 0.01→修正後 pass、--repeat-each=10 で 80 pass、基準 18 枚撮り直し (snapshots 75c386c)"]
blocked_by:
origin: 自リポ TODO
---

# terminals visual test が pid/経過時刻の帯で閾値超え diff を出す

## 概要

`test/visual/terminals.visual.ts` が light/dark 両方で基準との差分 0.01 (閾値 0.002) で落ちる。2026-09-16、`--repeat-each=5` の全件走行で dark 5 回中 4 回、light 5 回中 1 回失敗した。diff 画像の赤は端末行の pid / 経過時刻の帯のあたりに出ており、接続バーには出ていない。

## 背景

mask (`test/visual/screenshot.css`) の当たり損ね、または経過時刻の幅固定漏れが疑われる。pid や経過時刻は実行のたびに変わる値なので、visual 基準比較の対象から外れていないと非決定的に落ちる。

## 受け入れ条件

- [ ] 全件走行 10 回で terminals の visual test が pass する
- [ ] 変動する値 (pid / 経過時刻) が mask か幅固定で絵から外れていることがコードで示せる

## TODO

<!-- wip 時のみ -->
