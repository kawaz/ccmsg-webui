---
title: Composer の textarea auto-grow とタップ的中域 (v1 にあり v2 に無い操作性)
status: open
category: task
created: 2026-09-12T08:12:47+09:00
last_read:
open_entered: 2026-09-12T08:12:47+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: v1-parity-for-migration
---

# Composer の textarea auto-grow とタップ的中域 (v1 にあり v2 に無い操作性)

## 概要

v1 の Composer / TL にあって v2 に無い操作性が 2 点ある。

1. **textarea の auto-grow**: v1 は `autosizeTextarea` で入力に合わせて高さが伸び、10 行で内部スクロールに切り替わる。v2 は `rows={3}` + `resize: vertical` のままで、入力に応じて高さが変わらない。
2. **タップ的中域**: v1 は `@media (pointer: coarse)` でボタン等の min-height 44px を確保している。v2 には無く、スマホで押しにくい。

## 背景

2026-09-12、v1 `packages/webui/src/client/components/Composer.tsx` と `app.css` の読み合わせで判明。v1 から v2 への移行にあたっての parity 項目の 1 つ。

## 受け入れ条件

- [ ] Enter 改行で textarea の高さが伸び、10 行で高さが止まり内部スクロールに切り替わる
- [ ] 送信後は textarea の高さが元に戻る
- [ ] coarse pointer (タッチ) 環境で、押せる要素の的中域が 44px 以上になっている (phone の visual 基準で確認)
