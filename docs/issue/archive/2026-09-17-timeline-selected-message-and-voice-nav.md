---
title: TL の「選択中のメッセージ」と同じ声の軸での前後移動
status: resolved
category: request
created: 2026-09-17T07:43:49+09:00
last_read:
open_entered: 2026-09-17T07:43:49+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered: 2026-09-19T11:46:24+09:00
discard_reason:
pending_reason:
close_reason: ["done: v1.9.0 で DR-0003 のアクションとして実装済み"]
blocked_by:
origin: kawaz
---

# TL の「選択中のメッセージ」と同じ声の軸での前後移動

## 概要

v2 の TL に「選択中のメッセージ」を入れる (v1 の位置選択に相当。v1 の 👤 nav は不要)。選択の見せ方はボーダーを強める or 選択色で囲む (吹き出しの 2 段階層と両立)。選択中のメッセージから同じ声の軸で前後に移動する: ユーザのメッセージなら前後のユーザのメッセージ、Notification (say) なら前後の Notification、メインならメイン、特定のチームメイト / サブエージェントならそのチームメイトとの応答、を辿る汎用の形 (`voiceOf` / `memberOf` の値が同じ item を辿る)。

キーボードショートカットは持たない裁定なので、移動は選択中の吹き出しに出る ▲ ▼ の操作にする (要確認)。

## 背景

v1 では位置選択と 👤 nav (話者ごとの前後移動) があったが、v2 の TL には選択状態そのものが無い。「同じ声」を辿る操作は v1 の 👤 nav に相当するが、v2 では汎用の軸判定 (`voiceOf` / `memberOf`) で実装する。

## 受け入れ条件

- [x] クリックで TL 上のメッセージを選択できる (Timeline.tsx:1174)
- [x] 選択中のメッセージから同じ声の前後 (ユーザ / Notification / メイン / 特定チームメイト・サブエージェント) へ移動できる (voice-nav.ts の hasVoiceNeighbour)
- [x] 選択の見た目が吹き出しの 2 段階層 (誰から/誰へ、种别) と両立する
- [x] ▲ ▼ の移動操作が visual test に含まれる (test/visual/actions.visual.ts)
