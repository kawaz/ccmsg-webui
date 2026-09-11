---
title: teammate 同士の会話を俯瞰する view (team overview)
status: open
category: request
created: 2026-09-11T10:39:58+09:00
last_read:
open_entered: 2026-09-11T10:39:58+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: kawaz 依頼 (2026-09-11 r298m52)
---

# teammate 同士の会話を俯瞰する view (team overview)

## 概要

lead + teammate 全員の transcript (`sid` と `sid/agent-<id>` ×N) を時系列で重ねて見る view。
型 (`message.team` 等) の話ではなく **view のモード** として提供する。各 item は主語 (どの
transcript 由来か) を持ったまま、型は主語相対のまま変えない。

同じ 1 通のメッセージが 2 回観測される (A の `message.team.out` と B の `message.team.in`、
lead の `team:out` と B の `parent:in`) ので、これを対応付けて 1 行 (「A → B」+ 送信/受信の
時刻) に見せる。

## 背景

対応付けの鍵は `SendMessage` の tool_result に載る `msg_id`。これが受け側の
`<teammate-message>` 封筒にも載っていれば決定的にペアリングできる。載っていない場合は
(送り手, 受け手, 本文ハッシュ, 時刻の近さ) で寄せるフォールバックが要る。

実 record で `msg_id` の有無を先に確認する必要がある (= 未検証)。

まずは read-only (`transcript.items.read` ×N、完了済みチームの分析用) から着手する。
live 追従 (worker 側の追記をリアルタイムに流す経路) は現状 topic が main のみなので
後回しでよい。

## 着手条件

- 表示属性 2 面の実装
- worker route (v0.4 系) の実装
- 契約 1.18.0 (`message.parent` / `team`) への追従

これらが終わってから着手する (= 現時点では前提未整備)。

## 受け入れ条件

- [ ] `msg_id` の有無を実 record で確認する
- [ ] lead + teammate 全員の transcript を時系列マージして表示できる
- [ ] 同一メッセージの往復ペア (out/in) を 1 行に統合表示できる
- [ ] msg_id が無い場合のフォールバック照合 (送信者/受信者/本文ハッシュ/時刻近接) が動く
- [ ] read-only 表示がまず動く (live 追従は対象外でよい)
