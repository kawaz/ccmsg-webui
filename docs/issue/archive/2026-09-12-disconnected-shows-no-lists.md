---
title: 未接続時にセッション一覧などを描かない
status: resolved
category: bug
created: 2026-09-12T08:28:51+09:00
last_read:
open_entered: 2026-09-12T08:28:51+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered: 2026-09-12T08:38:32+09:00
discard_reason:
pending_reason:
close_reason: ["done: webui v0.9.1 で修正 (2026-09-12)","(1) listed=false の間は一覧・TL・mesh 行を描かず接続画面のみ (snapshot 未受信で行0件の嘘を通さない)","(2) 意図しない切断は行を残し「切断中 / 表示は最後に受け取った内容です」の帯を被せ、再接続の snapshot で置き換え","(3) 明示的な切断は in-memory 全クリア(slots/fold/hello/transcript/開閉/通知/控え/token)、localStorage は残す","visual: first-connect 基準で一覧 DOM 無しを assert、意図しない切断は routeWebSocket で instance 側から閉じて再現"]
blocked_by:
origin: kawaz (2026-09-12、実機)
---

# 未接続時にセッション一覧などを描かない

## 概要

未接続の時点でセッション一覧などが出ている (kawaz 2026-09-12、実機)。あるべき: 未接続 = 接続画面 (接続ボタンと状態) だけで、一覧・TL・mesh 行は描かない。接続後に snapshot が届いてから一覧を出す。切断された時は前回の行を残さず消す (または「切断中」の帯で覆って操作不能にする)。

## 背景

見立て: 切断時に slots signal は空にしているが、初期レンダリングでレイアウト全体 (一覧の見出し・空グループ等) を描いている / fold の保持分が再描画で出ている。

親: v1-parity-for-migration (束 0、Usage より先)。

## 受け入れ条件

- [ ] 未接続で一覧の DOM が無い (visual `first-connect` 基準で確認)
- [ ] 切断 → 一覧が消える
- [ ] 再接続 → snapshot 後に戻る

## 仕様の確定 (kawaz 2026-09-12)

切断を 3 つに分ける。

1. **初回 / 未接続** (一度も snapshot を受けていない): 一覧・TL・mesh 行を描かない。
2. **意図しない切断** (回線断、instance 側の切断): PWA に残っているものはそのまま見えたまま、「切断中」の状態表示だけ出し、再接続の snapshot で置き換わる。
3. **ユーザの明示的な切断** (切断ボタン): ログアウト相当で in-memory のステートを全クリア (一覧・TL・fold・token)。localStorage (表示設定等) は消さない。
