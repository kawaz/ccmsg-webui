---
title: 接続前の接続バーに要らないものが出ている (「未接続」の表記、セッション一覧の「一覧」ボタン)
status: open
category: bug
created: 2026-09-16T08:58:20+09:00
last_read:
open_entered: 2026-09-16T08:58:20+09:00
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

# 接続前の接続バーに要らないものが出ている (「未接続」の表記、セッション一覧の「一覧」ボタン)

## 概要

kawaz 2026-09-16 (v1.3.0 の見た目確認)。切断状態の接続バーに (1) endpoint の左の「未接続」の文字 (ドットで状態は伝わる)、(2) セッション一覧を出し入れする「一覧」ボタン (接続前は出す中身が無い) が出ている。

## 背景

直すこと:

- 切断状態では「未接続」の文字を出さない (ドットの色だけ)
- 「一覧」(`SessionsToggle`) は接続して一覧に中身がある時だけ出す
- 接続前のバーは endpoint + 「接続」だけにする

## 受け入れ条件

- [ ] visual の切断状態の画面で、バーに endpoint と「接続」以外が無い
- [ ] 接続後は今までどおり

## 関連

- `src/ui/ConnectionBar.tsx`、契約 CT-Q11 (endpoint と origin を分ける件は別)
