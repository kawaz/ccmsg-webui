---
title: 送信欄が送信後にクリアされない・送信キーが v1 と違う
status: open
category: bug
created: 2026-09-16T00:00:00+09:00
last_read:
open_entered: 2026-09-16T00:00:00+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: kawaz (v1.4.0 の見た目確認)
---

# 送信欄が送信後にクリアされない・送信キーが v1 と違う

## 概要

TL の送信欄で、送信後にテキストエリアがクリアされないため送信されたのか分からない。
また送信キーが v1 と違う。

## 背景

kawaz が v1.4.0 の見た目確認中に発見。v1 の composer 実装
(`~/.local/share/repos/github.com/kawaz/claude-ccmsg/main/packages/webui/src/` の composer) を
先に読み、送信キー・Shift+Enter 等の挙動を表にしてから合わせること。

## 受け入れ条件

- [ ] 送信が受け付けられたらテキストエリアを空にする (送信の成否が分かる形。失敗時は本文を残してエラーを出す)
- [ ] 送信キーを v1 と同じにする
- [ ] Enter の扱いが v1 と同じ (Shift+Enter 等の挙動も含め v1 の表と一致)
