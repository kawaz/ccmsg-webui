---
title: sessions の visual test が同一走行内の他 spec の副作用に依存している
status: resolved
category: bug
created: 2026-09-17T08:42:09+09:00
last_read: 2026-09-17T11:53:18+09:00
open_entered: 2026-09-17T08:42:09+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered: 2026-09-19T13:55:50+09:00
discard_reason:
pending_reason:
close_reason: ["done:2017de40 で settledOrder() を harness に追加、話しかける test を専用 TALK_SID へ分離、全19 spec 単体一致・フル140 passed"]
blocked_by:
origin: 自リポ TODO
---

# sessions の visual test が同一走行内の他 spec の副作用に依存している

## 概要

`sessions` の visual (画面内の「人が話しかけた順」) が、同じ走行で先に走った spec の副作用に依存している。`--update-snapshots` を一部の spec にだけ掛けると、フル走行では再現しない状態の基準ができて壊れる。

## 背景

テーマ名プリセットの作業中に観測 (2026-09-17)。部分 spec にだけ `--update-snapshots` を掛けたところ 2 回失敗し、フル撮り直し → フル突き合わせでようやく解消した。

## 受け入れ条件

- [x] `sessions` の spec が自分で前提状態を作り、他 spec に依存しない
- [x] 部分撮り直しでも基準がフル走行と一致する
- [x] `playwright test session-list.visual.ts --update-snapshots=all` 単独で作った基準がフル走行で pass する
