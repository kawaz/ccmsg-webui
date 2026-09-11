---
title: スマホ初回アクセスの接続・認証導線を直す
status: resolved
category: bug
created: 2026-09-12T07:35:33+09:00
last_read:
open_entered: 2026-09-12T07:35:33+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered: 2026-09-12T08:11:24+09:00
discard_reason:
pending_reason:
close_reason: ["done:webui v0.7.0 で修正 (2026-09-12)。読み込み時は cookie がある時だけ resume、押下1回で token→refresh cookie→passkey、token 無ければ再ダイヤルせず authRequired で停止、passkey 未登録/拒否時は登録案内、接続/切断はボタン1本。根本原因は無条件 connect と拒否 handshake の永久 backoff 再ダイヤル。visual に first-connect 画面追加"]
blocked_by:
origin: v1-parity-for-migration (束 0 の先頭)
---

# スマホ初回アクセスの接続・認証導線を直す

## 概要

スマホからの初回アクセスで接続・認証の導線が悪い (kawaz 2026-09-12、実機確認)。

現象:

- 「接続」を押すと即切断され、何度押しても繰り返す
- 「認証が必要です」のエラーは出るが認証に進まない
- 最初から認証の案内が大きく出ている
- 接続 / 切断のボタンが切り替わらない

## 背景

原因の見立て: WS を張って `hello.user` を送り token が無く拒否 → 切断、を UI がそのまま繰り返している。

あるべき流れ:

1. 初期画面は「接続」ボタンだけ、認証の説明は出さない
2. 接続して認証が要ると分かった時点で自動的に passkey のサインインへ進む (押し直させない)
3. サインインがキャンセルされた / 登録済み passkey が無い時に、その時点で登録の案内 (登録 URL + 6 桁コードを管理者から受け取る手順、`ccmsg daemon passkey add <config home>`) を出す
4. 接続中は「切断」、切断中は「接続」にボタンが切り替わる。エラーは 1 回だけ出し、次の行動 (サインイン / 登録) を添える

visual 基準 (register / sign-in 画面) の更新を伴う。

親: v1-parity-for-migration (束 0 の先頭)。

## 受け入れ条件

- [ ] 未登録のスマホから開いて「接続」1 回で登録案内まで辿り着く
- [ ] 登録済みなら「接続」1 回でサインイン → 一覧が出る
- [ ] 接続状態とボタンの表示が常に一致する

## TODO

<!-- wip 時のみ -->
