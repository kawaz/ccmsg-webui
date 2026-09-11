---
title: TL の幅崩れとバブル左余白を最低限見やすくする
status: open
category: bug
created: 2026-09-12T07:52:27+09:00
last_read:
open_entered: 2026-09-12T07:52:27+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: kawaz 実機確認 (スマホ, webui v0.7.0)
---

# TL の幅崩れとバブル左余白を最低限見やすくする

## 概要

TL を最低限見やすくするための 2 点 (kawaz 2026-09-12、スマホ実機、webui v0.7.0)。

1. メッセージのバブル (吹き出し) の左にある無駄な余白を削る。
2. 画面幅の壊れ: 上へ履歴をスクロールしていく (古い item がページ読み込みで足される) と、何かの要因でコンテンツ幅が広がり、入力時とブラウズ時の表示が滅茶苦茶になる。

## 背景

見立て: 幅を決めている要素 (コードブロック、長い1行のテキスト、pre、表、長いURL) が縮まず親を押し広げている (`min-width: 0` / `overflow-x: auto` / `overflow-wrap` の欠け)。virtual window / page-scroll で挿入される item の幅計算が viewport でなくコンテンツに引きずられている可能性もある。

やること: スマホ幅 (375px 程度) の visual 基準を 1 枚足して再現 → 原因を特定 → 直す。

親: v1-parity-for-migration (束 0、初回導線の次)。

## 受け入れ条件

- [ ] どこまでスクロールしても本文の幅が viewport を超えない
- [ ] 横スクロールはコードブロックの内側だけ
- [ ] 入力欄が常に見える幅で出る
- [ ] バブル左の余白がテキストの開始位置と揃う
