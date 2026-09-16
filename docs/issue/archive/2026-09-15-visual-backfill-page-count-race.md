---
title: visual test の backfill 件数 assert が全件走行の負荷下で早着き race を起こす
status: resolved
category: bug
created: 2026-09-15T13:05:25+09:00
last_read:
open_entered: 2026-09-15T13:05:25+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered: 2026-09-16T09:59:58+09:00
discard_reason:
pending_reason:
close_reason: ["done: commit 14e62be2 / 9cd9ad70 で真因(scrollのframe畳み込みで上端到達がハンドラに届かない)を修正。harnessのholdTimelineAtTopで、頼みが届く事象(見出し数の変化/端の1行)まで上端に居させる形に。notificationは接続→見出し→語の段で待つ。--repeat-each=5の全件走行で3テストとも10/10 pass"]
blocked_by:
origin: ccmsg
---

# visual test の backfill 件数 assert が全件走行の負荷下で早着き race を起こす

## 概要

`test/visual/transcript-backfill.visual.ts` の「末尾から始まり、遡ると手前が頁ずつ足される」テストが、全件走行の負荷下で 501 item 期待に対して 400 item で落ちることがある。

## 背景

2026-09-15、`just visual` 全件走行中に 1 回 fail (期待 501、実際 400)。単独では 3/3 pass、その後の全件 3 回でも再現なし。絵を撮らない振る舞いテスト。

仮説 (未確定): 遡りの 3 頁目 (`transcript.items.read` の `prev`) が届く前に assert に着く timing 依存。

`test-integrity` rule によりこれを flaky 扱いにはしない。assert の前に「遡りが止まった (最後の頁が届いた、または先頭に達した) 」事象を待つ形に直す。timeout 延長で通すのは不可。

## 同種の観測 (2026-09-15)

`just visual-accept` の通しで `[light] notification` が 1 回だけ「`畳んだ値の読み方` が 5 秒以内に出ない」で落ちた (単独再実行と以後の通し 2 回は pass)。timing 依存の同型なので本 issue で一緒に扱う (待つ事象を明示する)。

## 受け入れ条件

- [ ] 当該テストを負荷下 (全件走行) で 10 回 pass
- [ ] 待つ事象がテストコードに明示的に書いてある

## TODO

<!-- wip 時のみ -->
