---
title: 翻訳の言語/道具セレクタが transcript 上端にあり、末尾読み中の切り替えでスクロール位置が飛ぶ
status: resolved
category: bug
created: 2026-09-12T08:52:20+09:00
last_read:
open_entered: 2026-09-12T08:52:20+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered: 2026-09-23T17:12:28+09:00
discard_reason:
pending_reason:
close_reason: ["done:現 main で解消済み。src/app.css の .timeline-head が position: sticky; top: 36px、item の ⋯ に timeline.toggle-reading (訳⇄原文切替) があり、test/visual/translate.visual.ts:57 が bodyScrollTop 不動を assert"]
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

- [x] 末尾を読んでいる状態で言語/道具を切り替えてもスクロール位置が動かない (visual + scroll 位置の assert)

## 現 main では既に解消している (2026-09-20)

採られたのは (c)。両方とも入っている:

- (a) `src/app.css` の `.timeline-head` が `position: sticky; top: 36px`。上の選択肢は本文と一緒に流れて行かない
- (b) item を選んだ時の `⋯` に「本文の言語を切り替える (訳 ⇄ 原文)」がある。読んでいる行のその場で切り替えられる

測っているのも既にある。`test/visual/translate.visual.ts` の「読んでいる所で切り替えても、読んでいる行は動かない」が、読んでいる文を画面の真ん中に置いてから item 側の入口を押し、`bodyScrollTop` が 1 px も動かないことと、訳で高さが変わっても読んでいた行が同じ高さに居ることを assert する。2026-09-20 の実行:

```
✓  1 [light] › test/visual/translate.visual.ts:57:1 › 読んでいる所で切り替えても、読んでいる行は動かない (3.1s)
✓  2 [dark] › test/visual/translate.visual.ts:57:1 › 読んでいる所で切り替えても、読んでいる行は動かない (3.1s)
```

close 候補。
