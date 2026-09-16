---
title: セッション一覧のセクション順序・表記を v1 に揃える
status: open
category: bug
created: 2026-09-16T17:02:36+09:00
last_read:
open_entered: 2026-09-16T17:02:36+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: kawaz
---

# セッション一覧のセクション順序・表記を v1 に揃える

## 概要

v1.4.0 の見た目確認 (2026-09-16)。セッション一覧で「起動中」セクションが一番上に来るのはあり得ない。セクションの順序は v1 (`~/.local/share/repos/github.com/kawaz/claude-ccmsg/main/packages/webui/src/` のセッション一覧) と同じにする。セクション名の無駄な日本語化も不要 (v1 の表記に揃える)。

## 背景

kawaz が v1.4.0 の見た目を確認していて発見。v2 webui のセッション一覧のセクション順序・セクション名表記が v1 と異なっており、特に「起動中」セクションが先頭に来る並びは不自然。

## 受け入れ条件

- [ ] v1 と同じ順でセクションが並ぶ
- [ ] v1 と同じ表記でセクション名が並ぶ (無駄な日本語化をしない)
- [ ] visual の基準を撮り直す
