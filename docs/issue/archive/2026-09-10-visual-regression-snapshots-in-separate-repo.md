---
title: Visual regression テストの導入 (基準画像は別リポ管理)
status: resolved
category: design
created: 2026-09-10T12:41:06+09:00
last_read:
open_entered: 2026-09-10T12:41:06+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered: 2026-09-10T22:50:46+09:00
discard_reason:
pending_reason:
close_reason: ["done: webui v0.2.10 で test/visual/ (Playwright toHaveScreenshot、実 daemon + CDP virtual authenticator の実 passkey 登録 + fixture transcript、11 画面、platform ごとに基準画像、閾値 maxDiffPixelRatio 0.002、接続バーの期限と daemon version を mask)。基準画像は kawaz/ccmsg-webui-snapshots (public、darwin/ + linux/ 各 11 枚)、本体は manifest (画面 → platform → sha256 + version)。`just visual` / `just visual-accept`、CI は独立 visual job、workflow_dispatch の redraw_baselines で runner が linux 版を描く。CI run 34484983398 で visual 込み green (2026-09-10)。"]
blocked_by:
origin: kawaz 依頼
---

# Visual regression テストの導入 (基準画像は別リポ管理)

## 概要

画面の見た目の変遷を version ごとに残し、UI の壊れを継続的に検知するビジュアルリグレッションテストを入れる。手法は Playwright の `toHaveScreenshot()` で画面状態ごとに基準画像と比較する。既存の CDP virtual authenticator + 使い捨て instance + vite proxy の経路に乗せる。

対象の初期集合:

- 登録画面
- sign-in
- Sessions 一覧
- Timeline (Markdown・fold 開閉・検索ハイライト)
- Files (コード・markdown プレビュー)
- 会話 (composer・通知)

基準画像は本体リポに入れず、別リポ `kawaz/ccmsg-webui-snapshots` に置く。本体側は manifest (画像 sha256 + webui version + 画面名) だけを持つ。CI は snapshots リポを shallow clone して比較し、基準の更新は `just snapshots-accept` で snapshots リポへ commit する (= version ごとの見た目の年表がその履歴になる)。

## 背景

kawaz からの依頼 (2026-09-10)。UI の見た目の壊れを継続的に検知したい。

基準画像を本体リポに直接コミットする方式は不採用:

- **git LFS**: 課金と clone の取り回しの問題
- **CI artifact**: 基準更新の動線が無い

別リポ方式なら、本体は軽量な manifest だけを持ち、画像そのものの履歴は snapshots リポの commit history に閉じ込められる。

## 受け入れ条件

- [ ] 初期集合の各画面で `toHaveScreenshot()` によるスナップショット比較が動く
- [ ] 基準画像が `kawaz/ccmsg-webui-snapshots` リポで管理され、本体リポは manifest (画像 sha256 + webui version + 画面名) のみを持つ
- [ ] CI が snapshots リポを shallow clone して比較を実行する
- [ ] `just snapshots-accept` 相当のコマンドで基準画像を snapshots リポへ commit できる
- [ ] 下記の論点について方針が決まっている

## 論点

- 閾値: フォント・アンチエイリアスの差をどう吸収するか
- CI の Chromium と手元の Chromium の差分の扱い
- 暗色テーマ (dark mode) を対象に含めるか
- snapshots リポ (`kawaz/ccmsg-webui-snapshots`) を public にするか private にするか
