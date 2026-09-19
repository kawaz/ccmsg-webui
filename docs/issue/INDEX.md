# Issue INDEX

active な issue の一覧。close 済みは archive/ にあり、ここには載せない。

| date | category | status | slug | 概要 |
|---|---|---|---|---|
| 2026-09-19 | bug | open | [visual-file-word-bubble-vertical-drift](./2026-09-19-visual-file-word-bubble-vertical-drift.md) | visual test の file-word-bubble が縦位置ずれで落ちる (原因未特定) |
| 2026-09-18 | design | open | [pinned-key-missing-instance](./2026-09-18-pinned-key-missing-instance.md) | 留めたセッションの鍵が instance を名乗っていない (ccmsg.sessions.pinned) |
| 2026-09-18 | bug | open | [markdown-code-span-url-becomes-link](./2026-09-18-markdown-code-span-url-becomes-link.md) | メッセージ本文の markdown で、インライン code に書かれた URL がリンクにならない |
| 2026-09-17 | request | open | [request-hyoui-iframe-allow-publickey-credentials-get](./2026-09-17-request-hyoui-iframe-allow-publickey-credentials-get.md) | hyoui を埋め込む iframe の `allow` に `publickey-credentials-get` を足す (hyoui DR-0036 passkey 認証) |
| 2026-09-17 | request | open | [timeline-waiting-tool-and-background-button](./2026-09-17-timeline-waiting-tool-and-background-button.md) | 同期ツール実行中を TL に待機表示し、Background ボタンで端末を Ctrl+B 化 |
| 2026-09-17 | request | open | [reserved-keys-beyond-chromium](./2026-09-17-reserved-keys-beyond-chromium.md) | 予約キーの表の出典を Chromium 以外 (Firefox / Edge、Windows・Linux の実機、Safari の動的分) まで広げる |
| 2026-09-17 | bug | open | [visual-sessions-depends-on-spec-order](./2026-09-17-visual-sessions-depends-on-spec-order.md) | sessions の visual test が同一走行内の他 spec の副作用に依存している |
| 2026-09-16 | bug | open | [composer-send-clear-and-key](./2026-09-16-composer-send-clear-and-key.md) | TL 送信欄が送信後にクリアされない・送信キーが v1 と違う |
| 2026-09-16 | bug | open | [visual-threshold-misses-removed-bar-items](./2026-09-16-visual-threshold-misses-removed-bar-items.md) | visual test の閾値が要素まるごと削除の退行を検出できない (接続バーの例) |
| 2026-09-16 | bug | open | [visual-inbox-pixel-diff-single-run-flaky](./2026-09-16-visual-inbox-pixel-diff-single-run-flaky.md) | visual の inbox 画面が全体走行で 1 度だけ pixel 差で落ちた (単体・次の全体走行では再現せず) |
| 2026-09-16 | bug | open | [visual-session-list-row-timing](./2026-09-16-visual-session-list-row-timing.md) | セッション一覧系 visual test が回によって 1〜3 件落ちる (行のタイミング差) |
| 2026-09-12 | task | open | [composer-autogrow-and-touch-targets](./2026-09-12-composer-autogrow-and-touch-targets.md) | Composer の textarea auto-grow とタップ的中域 (v1 にあり v2 に無い操作性) |
| 2026-09-12 | task | open | [launcher-cwd-tree](./2026-09-12-launcher-cwd-tree.md) | Session Launcher の「始める場所」にディレクトリツリー選択 (展開/フィルタ) を追加 |
| 2026-09-12 | task | open | [v1-parity-for-migration](./2026-09-12-v1-parity-for-migration.md) | kawaz が v1 webui から v2 に移るために要るものの棚卸し。画面が無いだけの機能が上位 |
| 2026-09-12 | bug | open | [translate-selector-placement](./2026-09-12-translate-selector-placement.md) | 翻訳の言語/道具セレクタが transcript 上端にあり、末尾読み中の切り替えでスクロール位置が飛ぶ |
| 2026-09-12 | bug | open | [visual-accept-stale-module](./2026-09-12-visual-accept-stale-module.md) | visual-accept が dev server の古い module を撮って基準が実は古いまま通ることがある |
| 2026-09-11 | request | open | [team-overview-view](./2026-09-11-team-overview-view.md) | teammate 同士の会話を俯瞰する view (team overview) |
| 2026-09-11 | bug | open | [anchor-snapshot-one-frame-stale](./2026-09-11-anchor-snapshot-one-frame-stale.md) | Timeline 遡り読みの錨が scroll 事象 1 フレーム分だけ古くなる |
| 2026-09-14 | request | wip | [markdown-preview-fuzzy-file-links](./2026-09-14-markdown-preview-fuzzy-file-links.md) | Markdown プレビューで、省略されたファイル名の言及をプロジェクト内ファイルへのリンクにする |

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
