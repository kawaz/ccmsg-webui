---
title: 翻訳の言語/道具セレクタが transcript 上端にあり、末尾読み中の切り替えでスクロール位置が飛ぶ
status: open
category: bug
created: 2026-09-12T08:52:20+09:00
last_read:
open_entered: 2026-09-12T08:52:20+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: 自リポ TODO
---

# 翻訳の言語/道具セレクタが transcript 上端にあり、末尾読み中の切り替えでスクロール位置が飛ぶ

## 概要

翻訳の言語 / 道具の選択肢が transcript の上端にあるため、末尾を読んでいる状態から切り替えるとブラウザがボタンを画面内へ入れるためにページが先頭へ動く。

## 背景

2026-09-12、翻訳タブ実装時に気づいた (Playwright でも再現)。v1 は thinking ごとのツールバーに選択肢を置いていたので起きなかった。

案:

- (a) 選択肢を sticky にする
- (b) item 側にも入口を置く (v1 の形)
- (c) 両方

読みながら切り替える用途を優先するなら (b)。

## 受け入れ条件

- [ ] 末尾を読んでいる状態で言語/道具を切り替えてもスクロール位置が動かない (visual + scroll 位置の assert)

## TODO

<!-- wip 時のみ -->
