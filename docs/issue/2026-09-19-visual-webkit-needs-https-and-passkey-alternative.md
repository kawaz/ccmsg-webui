---
title: webkit で webui 本体の画面を観測できない
status: open
category: bug
created: 2026-09-19T20:48:11+09:00
last_read:
open_entered: 2026-09-19T20:48:11+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: ccmsg-webui
---

# webkit で webui 本体の画面を観測できない

## 概要

visual / 観測を webkit (= iPhone に載るエンジン) で走らせようとすると、**登録済みの頁に到達できない**。実機の症状が出ているのは iPhone なので、本体を webkit で見られないのは観測の穴になっている。

## 現象 (実測)

2 つの入口が両方とも塞がっている。

1. **passkey の登録が chromium 専用**。harness の `addAuthenticator` は仮想 authenticator を CDP (`browserContext.newCDPSession`) で置くが、CDP は chromium にしか無い。webkit で走らせると全 test が setup で落ちる:

```
Error: browserContext.newCDPSession: CDP session is only available in Chromium
```

2. **chromium で登録して cookie を移す道も塞がっている**。refresh cookie は `__Secure-` 接頭辞付きで、http オリジン (`http://localhost:45872/`) には置けない。`secure: false` に落として渡すと接頭辞の規則で弾かれる。実測:

```
[cookie] chromium 1 件 (__Secure-ccmsg-… secure=true domain=localhost path=/auth/ sameSite=Strict) → webkit 0 件
```

`context.addCookies` で渡しても webkit の cookie store に 1 件も入らず、頁は sign-in 画面のまま。

## 今できている代替と、その限界

Timeline と同じ DOM / CSS の入れ子を組んだ素の頁でなら webkit を測れる。支えは両エンジンとも揃っていて (`content-visibility` / `contain-intrinsic-size` / `overflow-anchor` / `scroll-snap-type` / `position: sticky` すべて `CSS.supports` が true)、末尾追従・読んでいる行の保持・sticky の値も chromium と一致した。

限界は、**webui そのものの DOM で測っていない**こと。実際の item の高さ・fold・markdown・翻訳の入れ替わりが絡む所は再現ページでは出ない。基準画像を webkit で撮ることもできない。

## 要るもの (どちらか)

- daemon 側に **https の口** (自己署名でよい)。オリジンが https になれば `__Secure-` cookie を移植できる
- あるいは **test 用の認証経路** (登録済みの session を CLI 側で作って、頁が受け取れる形で渡す)

## 背景

{なぜ必要か、どこから来た要望か}

## 受け入れ条件

- [ ] webkit で登録済みの webui を開ける
- [ ] 末尾追従 / 遡り / sticky を webui 本体の DOM で webkit 実測できる
