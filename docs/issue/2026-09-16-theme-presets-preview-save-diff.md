---
title: 色の設定画面にプリセット・プレビュー/保存の区別・変更差分 UI を追加
status: open
category: request
created: 2026-09-16T17:42:31+09:00
last_read:
open_entered: 2026-09-16T17:42:31+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
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
