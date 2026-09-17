---
title: 接続バーは接続後は主役でなくなる (帯として居座らせない)
status: open
category: design
created: 2026-09-17T09:17:57+09:00
last_read:
open_entered: 2026-09-17T09:17:57+09:00
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

# 接続バーは接続後は主役でなくなる (帯として居座らせない)

## 概要

接続バーは接続前の主役 (endpoint 入力 + 接続 + 認証) だが、**接続後は主役でなくなる**。接続後の画面では帯として居座らず、endpoint の表示はフッタ等に極小フォントで (ほとんど気にしない情報)、接続状態は絵文字 / アイコンの小さな部品として画面内の必要な場所に散らばって置かれる程度にする。

設定 (`/settings`) は**接続後のみ** (接続前は未認証の通りすがりが見る画面。置くとしても言語と light / dark の切替程度)。

## 背景

設定・登録の画面で帯が消える現状は DR-0003 §2.2 の食い違いになっている。この食い違いは、帯を無くす方向で解消する。

DR-0003 の木 (接続の帯と設定を app 直下に置いた版) を「設定は接続後の子、接続後の状態表示は小部品」に直し、Register / SignIn / Disconnected は未接続の子のまま。

## 受け入れ条件

- [ ] 接続後の画面に帯が無く、状態アイコンと極小の endpoint 表示がある
- [ ] 接続前は今の形 (endpoint + 接続) のまま
- [ ] 設定 (`/settings`) は接続後のみ到達可能
- [ ] DR-0003 の木を上記方針に更新 (Register / SignIn / Disconnected は未接続の子のまま)
- [ ] visual test の基準を撮り直す

## 追記 (kawaz 2026-09-17)

詳細な接続情報 (endpoint、instance、契約の版、token の期限、credential の webui など) や認証に関する情報は、接続後のグローバルの状態画面やセッションの状態画面に置いてよい。帯の役目ではなく、認証状態や場面によって出す場所と量が違うだけ。
