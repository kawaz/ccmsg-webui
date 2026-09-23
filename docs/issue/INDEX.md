# Issue INDEX

active な issue の一覧。close 済みは archive/ にあり、ここには載せない。

| date | category | status | slug | 概要 |
|---|---|---|---|---|
| 2026-09-24 | task | open | [webui-service-worker-adds-coop](./2026-09-24-webui-service-worker-adds-coop.md) | webui に SW を足し navigation 応答に COOP: same-origin を付ける (DR-0005 §2.2/§5) |
| 2026-09-24 | task | open | [view-origin-per-open-and-registration-ledger](./2026-09-24-view-origin-per-open-and-registration-ledger.md) | 閲覧を開くたびに別 origin で描き、SW 登録の台帳と掃除を webui が持つ (DR-0005 §2.1 / §2.5) |
| 2026-09-19 | design | open | [fab-place-reset-in-settings](./2026-09-19-fab-place-reset-in-settings.md) | 話しかける口の居場所と高さを「既定に戻す」手を設定の画面に置くか |
| 2026-09-19 | design | open | [timeline-item-size-follows-snap-state](./2026-09-19-timeline-item-size-follows-snap-state.md) | transcript 1 通のサイズをスクロールスナップ状態に CSS だけで追従させる (scroll-state / view timeline) |
| 2026-09-19 | bug | open | [visual-file-word-bubble-vertical-drift](./2026-09-19-visual-file-word-bubble-vertical-drift.md) | visual test の file-word-bubble が縦位置ずれで落ちる (原因未特定) |
| 2026-09-19 | bug | open | [visual-webkit-needs-https-and-passkey-alternative](./2026-09-19-visual-webkit-needs-https-and-passkey-alternative.md) | webkit で webui 本体の画面を観測できない (passkey が chromium 専用、__Secure- cookie が http に置けない) |
| 2026-09-19 | bug | open | [visual-fab-window-frame-1px-misaligned](./2026-09-19-visual-fab-window-frame-1px-misaligned.md) | 口の窓と本文の枠が、同じ幾何のまま 1px 違う所に焼ける (actions-fab-moved.png が時々落ちる) |
| 2026-09-18 | design | open | [pinned-key-missing-instance](./2026-09-18-pinned-key-missing-instance.md) | 留めたセッションの鍵が instance を名乗っていない (ccmsg.sessions.pinned) |
| 2026-09-17 | request | open | [request-hyoui-iframe-allow-publickey-credentials-get](./2026-09-17-request-hyoui-iframe-allow-publickey-credentials-get.md) | hyoui を埋め込む iframe の `allow` に `publickey-credentials-get` を足す (hyoui DR-0036 passkey 認証) |
| 2026-09-17 | request | open | [timeline-waiting-tool-and-background-button](./2026-09-17-timeline-waiting-tool-and-background-button.md) | 同期ツール実行中を TL に待機表示し、Background ボタンで端末を Ctrl+B 化 |
| 2026-09-16 | bug | open | [composer-send-clear-and-key](./2026-09-16-composer-send-clear-and-key.md) | TL 送信欄が送信後にクリアされない・送信キーが v1 と違う |
| 2026-09-16 | bug | open | [visual-threshold-misses-removed-bar-items](./2026-09-16-visual-threshold-misses-removed-bar-items.md) | visual test の閾値が要素まるごと削除の退行を検出できない (接続バーの例) |
| 2026-09-12 | task | open | [v1-parity-for-migration](./2026-09-12-v1-parity-for-migration.md) | kawaz が v1 webui から v2 に移るために要るものの棚卸し。画面が無いだけの機能が上位 |
| 2026-09-11 | request | open | [team-overview-view](./2026-09-11-team-overview-view.md) | teammate 同士の会話を俯瞰する view (team overview) |

<!--
INDEX の列構成・canonical 順序・行形式の唯一の正本:

- 列構成は固定 (= 上記 5 列、列名と順序を変えない)
- 行の {{rows}} は active issue の行に置換する
- canonical 順序:
  1. status 優先順: idea → open → wip → blocked → pending-sublimation
  2. 同 status 内は date 降順 (= 新しい起票が上)
- 各行: `| YYYY-MM-DD | <category> | <status> | [<slug>](./YYYY-MM-DD-<slug>.md) | <本文 1 行目から 80 文字以内> |`
- 概要は 80 文字を超えたら末尾を「…」で省略
-->
