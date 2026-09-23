---
title: 閲覧を開くたびに別 origin で描き、SW 登録の台帳と掃除を webui が持つ (DR-0005 §2.1 / §2.5、FV-Q14 / FV-Q15)
status: open
category: task
created: 2026-09-24T02:24:51+09:00
last_read:
open_entered: 2026-09-24T02:24:51+09:00
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

# 閲覧を開くたびに別 origin で描き、SW 登録の台帳と掃除を webui が持つ (DR-0005 §2.1 / §2.5、FV-Q14 / FV-Q15)

## 概要

DR-0005 の 2026-09-24 改訂 (kawaz 裁定) の実装。閲覧の origin は
`https://ccmsg-view-<id>.<閲覧 site>` で id は開くたびに乱数、ビルド時定数
`CCMSG_VIEW_ORIGIN` は site の側だけを持つ形に変える。

閲覧側の頁 (`view/index.html` + `view/boot.ts`) は読み込まれただけでは SW を
登録せず、親からの「開く (ポート付き)」で登録し、「片付ける」で
`registration.unregister()` して答える。

webui は振った id を台帳 (webui origin の storage) に控え、

- (主経路) 定期 (6 時間ごと、1 時間より古い id) + 起動時に見えない iframe で
  「片付ける」を送って台帳から消す
- (副経路) iframe を外す前に「片付ける」を送り答えを待ってから外す

## 背景

DR-0005 §2.1 / §2.5 / §6、FV-Q14 / FV-Q15 の裁定に基づく実装タスク。

## 受け入れ条件

- [ ] 同じファイルを 2 回開くと別 origin になる (test)
- [ ] 頁を素で読み込んでも SW 登録が増えない (test)
- [ ] 100 回開いて閉じた後に `chrome://serviceworker-internals` の当該 site の登録が 0 (手動確認、Safari は Web Inspector の Storage)
- [ ] 閉じる前にタブを殺した分が次の定期掃除で消える (test: 台帳に残した id が掃除で消えることを fake の閲覧頁で確認)
- [ ] hosting (canddy-app-proxy の Caddyfile) に `ccmsg-view-*` の route を足す手順を docs に書く (tmpspace.net の wildcard は既にある)

## 関連

- DR-0005 §2.1 / §2.5 / §6, FV-Q14, FV-Q15
- `src/ui/FileView.tsx`
- `src/files/view-site.ts`
- `view/boot.ts`
- `view/sw.ts`
