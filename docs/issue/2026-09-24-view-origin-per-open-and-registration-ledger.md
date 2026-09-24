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

- [x] 同じファイルを 2 回開くと別 origin になる (test)
- [x] 頁を素で読み込んでも SW 登録が増えない (test)
- [x] 「片付ける」が origin に紐づく物を届く範囲で全部消す: SW の登録 (`getRegistrations()` 全件)、localStorage / sessionStorage、IndexedDB (`databases()` 全部)、Cache Storage (`keys()` 全部)、OPFS (root の全 entry)、cookie (名前ごとに `Domain` 有り無しの両方で失効) (test: fake の閲覧頁に全種を置いてから片付けて空になる)
- [x] hosting は起動の頁の応答に `Clear-Site-Data: "*"` を付ける (中身は SW が答えるので header は付かない)
- [x] 描いた物の CSP は `worker-src 'self'` (Worker が動く、test)。中身自身の script (`/view/...` 配下) の `register()` は取得が hosting へ行って失敗する。閲覧 site の `/sw.js` は登録できるが、ポートは登録ごとに最初の 1 回だけなので深い scope のインスタンスは何も答えられない (test)
- [ ] 100 回開いて閉じた後に当該 site の登録と storage 全種が 0 (Chrome は `chrome://serviceworker-internals` と DevTools の Application、Safari は Web Inspector の Storage で手動確認)
- [x] 閉じる前にタブを殺した分が次の定期掃除で消える (test: 台帳に残した id が掃除で消えることを fake の閲覧頁で確認)
- [x] `view/sw.ts` はポートの受け渡し (`ccmsg: PORT`) を**登録ごとに最初の 1 回だけ**受け、以後は無視する (origin は開くたびに変わるので差し替えは要らない)。描いた中身は同 origin で起動の頁と同じ権限を持ち、自分のポートを送る・起動の頁を自分の中に入れ子で開いてそこから送る、のどちらでも親のポートを追い出せないこと (test)
- [x] 「片付ける」は乱数の nonce 付きで送り、台帳から消すのは**主経路 (掃除用に新しく開いた起動の頁、中身なし) で同じ nonce の ack が返った時だけ**。閉じる時の副経路は unregister を試みるだけで台帳に触らない (中身は同 origin なので起動の頁に届いた nonce を読める・掃除の関数を書き換えられる)。中身が ack を偽装しても台帳から消えないこと (test)
- [x] webui は閲覧 origin からの message で、iframe の除去と主経路の台帳削除以外の動作をしない (test)
- [x] hosting (canddy-app-proxy の Caddyfile) に `ccmsg-view-*` の route と `Clear-Site-Data` の header を足す手順を docs に書く (tmpspace.net の wildcard DNS / 証明書は既にある)

## 関連

- DR-0005 §2.1 / §2.5 / §6, FV-Q14, FV-Q15
- `src/ui/FileView.tsx`
- `src/files/view-site.ts`
- `view/boot.ts`
- `view/sw.ts`
