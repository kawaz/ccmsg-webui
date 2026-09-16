---
title: 色の設定画面にプリセット・プレビュー/保存の区別・変更差分 UI を追加
status: resolved
category: request
created: 2026-09-16T17:42:31+09:00
last_read:
open_entered: 2026-09-16T17:42:31+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered: 2026-09-16T18:52:43+09:00
discard_reason:
pending_reason:
close_reason: ["dr/DR-0002","implemented","v1.6.0: 設定の土台 (DR-0002、ccmsg.settings の1文書に section、Section の parse/format/apply/changed/revert/adopt)、色 section にプリセット4組 (標準/暖色/寒色/無彩、高コントラストは段表に触れない方針で層0に作れず無彩に)、プレビューのみと保存の区別、ベースとの差分と項別の戻す。帯の入口は「設定」"]
blocked_by:
origin: kawaz
---

# 色の設定画面にプリセット・プレビュー/保存の区別・変更差分 UI を追加

## 概要

色の設定画面 (`/settings`、DR-0001) に次の 3 点を追加する。

1. ありがちな組合せのプリセット (数は絞る、例: 標準 / 暖色 / 寒色 / 高コントラスト × light / dark。名前で選ぶ)
2. 「プレビューのみ」(反映するが保存しない、離れたら戻る) と「保存」(localStorage、既存の `ccmsg.theme`) の区別
3. プリセットや保存値をベースに入力を触った時に、ベースと比べて変更した項目が分かる UI (どの入力が違うか、戻すボタン)

サーバ保存はしない。モダン CSS / JS を積極採用 (対象は最新 Chrome / Safari)。

## 背景

kawaz からの依頼 (2026-09-16)。既存の色設定画面は個々の値を直接編集する形だが、
ありがちな組合せを選ぶだけで一括反映できるプリセットと、値をいじった後に「試しているだけ」なのか
「確定した」のかを区別できる UI、そしてベースからの変更点が分かる差分表示が無い。

## 受け入れ条件

- [ ] プリセットを選ぶだけで画面全体が変わる
- [ ] 保存せず離れると元に戻る
- [ ] 保存すると次回も残る
- [ ] 変更項目が一目で分かる (戻すボタン含む)
- [ ] 基準画像 (visual test のスナップショット) の撮り直しを含む
