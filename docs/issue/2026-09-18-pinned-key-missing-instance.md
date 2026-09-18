---
title: 留めたセッションの鍵が instance を名乗っていない (ccmsg.sessions.pinned)
status: open
category: design
created: 2026-09-18T20:08:07+09:00
last_read:
open_entered: 2026-09-18T20:08:07+09:00
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

# 留めたセッションの鍵が instance を名乗っていない (ccmsg.sessions.pinned)

## 概要

`ccmsg.sessions.pinned` は留めた sid の並びを持つが、鍵の名前に instance が入っていない (`src/state.ts` の `PINNED_STORAGE`)。

## 背景

DESIGN「localStorage のキー規律」は「混線するものは instance (と sid) を名前に含める」と言っており、これはその規律に反している。1 つのブラウザが複数の instance に届くので、別の instance を開くと他の instance の sid が留まったままになる。

DR-0004 §2.6 のログアウトは「名前にユーザ・instance・sid のどれも含まないものが人の好み」で残す範囲を決める。このキーは名前だけ見ると好みに見えるが、値が instance のセッションを名指しているので好みではない。今は `keepOnSignOut` を通さないことで「消す側」に倒し、その理由をコードコメントに書いてある (= 値の意味で判定している、その場しのぎ)。

直し方: 鍵を `ccmsg.sessions.pinned:<instance>` にする。そうすれば判定が名前だけに戻り、DR-0004 §2.6 の例外記述も落とせる。移行は「読めなかったら空」で足りる (留め直すのは 1 押し)。

## 受け入れ条件

- [ ] 鍵が instance ごとに分かれている
- [ ] ログアウトの判定が名前だけで済む (`keepOnSignOut` を通さない理由のコメントが不要になる)
- [ ] DR-0004 §2.6 の「名前の規律に反しているキーは値の意味で判定する」段落を落とす
