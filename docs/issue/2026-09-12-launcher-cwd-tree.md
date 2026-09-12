---
title: Session Launcher にディレクトリツリー選択を追加
status: open
category: task
created: 2026-09-12T20:01:33+09:00
last_read:
open_entered: 2026-09-12T20:01:33+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: v1-parity-for-migration (束 0)
---

# Session Launcher にディレクトリツリー選択を追加

## 概要

Session Launcher の「始める場所」は root_dirs を押して下の欄に書き足す形 (v0.13.0)。v1 は root 配下を深さ 2 まで展開したディレクトリツリー + 検索フィルタを持っていた (DR-0018、`SessionCreator.tsx`)。v2 でツリーを出すには `dir.tree` (契約 `dir.tree`、daemon 実装済み) の往復と、それ用の UI (展開 / フィルタ / 選択) が要る。

## 背景

v1-parity-for-migration の棚卸しから派生。daemon 側の `dir.tree` 契約は実装済みで、webui 側の UI が未対応。

## 受け入れ条件

- [ ] root ごとにツリーを展開できる
- [ ] 名前でフィルタできる
- [ ] 選ぶと欄に入る
- [ ] 深さ上限は config (`dir_tree_depth` 相当) で決まる

## TODO

<!-- wip 時のみ -->
