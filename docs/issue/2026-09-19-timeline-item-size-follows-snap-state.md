---
title: transcript 1 通のサイズをスナップ状態に追従させる (CSS のみ)
status: open
category: design
created: 2026-09-19T16:50:16+09:00
last_read:
open_entered: 2026-09-19T16:50:16+09:00
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

# transcript 1 通のサイズをスナップ状態に追従させる (CSS のみ)

## 概要

transcript の 1 通は、スクロールでスナップ中 (または焦点がある) 時は少し大きく、そうでない時は細く、を CSS だけでやる。JS で自前制御しない (memory `webui-modern-platform-first`)。

手段の候補:

- `@container scroll-state(snapped: y)` — スナップ中の要素の見た目切り替え
- scroll-driven animations の `animation-timeline: view()` — 画面に入ってくる途中の連続変化

## 背景

kawaz 2026-09-19 の発案。前提として、timeline の末尾追従が CSS `scroll-snap` 化されていること (WebKit の末尾追従修正の後) が要る。

採用前に Safari の Baseline 状況 (`scroll-state` container queries / scroll-driven animations) を確認し、DR-0004 に「使う機能」と「Baseline の状態」を明記する。

## 受け入れ条件

- [ ] Safari (WebKit) での `@container scroll-state(snapped: y)` と `animation-timeline: view()` の Baseline / 対応状況を調査済み
- [ ] DR-0004 に採用機能と Baseline 状態を追記済み
- [ ] timeline 末尾追従の CSS scroll-snap 化が完了していることを確認 (前提条件)
- [ ] transcript 1 通のサイズが CSS のみでスナップ状態に追従する (JS 制御なし)
