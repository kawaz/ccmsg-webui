---
title: Timeline 遡り読みの錨が scroll 事象 1 フレーム分だけ古くなる
status: open
category: bug
created: 2026-09-11T11:14:44+09:00
last_read:
open_entered: 2026-09-11T11:14:44+09:00
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

# Timeline 遡り読みの錨が scroll 事象 1 フレーム分だけ古くなる

## 概要

Timeline の遡り読みの錨は scroll 事象で覚えているため、「人が動かした → その
scroll 事象が届く前に前の頁が届いた」瞬間だけ、届いた側が動かす前の位置へ
置き直してしまう。実機: `window.scrollTo` で 100 px 動かした直後に頁が届くと
100 px 巻き戻る。人の指では最大 1 フレーム分のずれ。

## 背景

錨を scroll 事象でなく「キーが変わる直前の DOM」から取れば消えるが、preact に
`getSnapshotBeforeUpdate` 相当が無く、render 本体で DOM を読むことになる。

## 受け入れ条件

- [ ] 錨の取得を描画直前の DOM 読みに変えるか、`scrollTo` 直後に錨を明示更新
      する API を置く
- [ ] `scrollTo` → 即 prepend の順で非ずれ 0 px のテスト
