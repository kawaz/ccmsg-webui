---
title: Composer で Enter が改行、送信は修飾キー + Enter / ボタンにする
status: resolved
category: request
created: 2026-09-12T07:52:32+09:00
last_read:
open_entered: 2026-09-12T07:52:32+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered: 2026-09-12T08:11:20+09:00
discard_reason:
pending_reason:
close_reason: ["done: webui v0.8.0 で修正 (2026-09-12): Enter / Shift+Enter は改行、⌘ / Ctrl+Enter と送信ボタンで送信、IME 変換中は修飾キー付きでも無視。placeholder を「Enter で改行、⌘/Ctrl+Enter で送信」に"]
blocked_by:
origin: v1-parity-for-migration (束 0)
---

# Composer で Enter が改行、送信は修飾キー + Enter / ボタンにする

## 概要

Composer で Enter を押すとそのまま送信されてしまい使いにくい (kawaz
2026-09-12、スマホ実機での指摘)。Enter は改行、送信は Ctrl+Enter /
Cmd+Enter とボタンに変更する。

## 背景

スマホの IME / ソフトキーボードでは Enter が改行として自然に効くことが
期待される。PC 相当の「Enter で即送信」はスマホの入力体験と噛み合わない。

## 受け入れ条件

- [ ] Enter で改行される
- [ ] 修飾キー (Ctrl+Enter / Cmd+Enter) と送信ボタンで送信できる
- [ ] 送信後に入力欄が空になり、フォーカスが残る
- [ ] IME 変換中の Enter (compositionend 前) では送信されない

## TODO

<!-- wip 時のみ -->
