---
title: visual-accept が dev server の古い module を撮って基準が実は古いまま通ることがある
status: open
category: bug
created: 2026-09-12T09:21:39+09:00
last_read:
open_entered: 2026-09-12T09:21:39+09:00
wip_entered:
blocked_entered:
blocked_by:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
origin: 自リポ TODO
---

# visual-accept が dev server の古い module を撮って基準が実は古いまま通ることがある

## 概要

`just visual-accept` で1度だけ、dev server が古い module を配って前の画面が撮れた
(2026-09-12)。accept が「基準画像は変わっていません」と言ったのに、次の run で
新しい DOM が撮れて差分が出た。基準を消して撮り直すことで解消した。

再発すると「直したのに基準が変わらない」形で症状が出るため気づきにくい。
原因未特定 (vite の変換キャッシュが怪しい)。

## 背景

当面の作法として、accept の後に snapshots リポ側の `git status` で差分が出て
いるか目視確認している。根本原因を潰すか、harness 側で鮮度を検知する仕組みが
要る。

## 受け入れ条件

- [ ] 再現条件を特定する (vite の cache dir を毎回消す / `--force` 起動 /
      dev server の起動タイミングのどれが効くか切り分け)
- [ ] visual harness 側に「基準と同じ画像が撮れた時に module の鮮度を確認する」
      仕組みを入れるか、accept 前に vite cache を捨てる 1 行を追加する
