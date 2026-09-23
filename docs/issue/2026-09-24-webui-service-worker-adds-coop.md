---
title: webui に Service Worker を足し、navigation の応答に Cross-Origin-Opener-Policy: same-origin を付ける
status: open
category: task
created: 2026-09-24T07:59:16+09:00
last_read:
open_entered: 2026-09-24T07:59:16+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: 依頼元プロジェクト
---

# webui に Service Worker を足し、navigation の応答に Cross-Origin-Opener-Policy: same-origin を付ける

## 概要

閲覧 iframe (sandbox `allow-scripts allow-same-origin allow-popups`) の中身が `_top` / `_parent` / `window.open` で webui の URL を指すと、WebKit は sandbox で塞いだ遷移を別窓に逃がし、iOS / iPadOS の PWA は scope 内の別窓を PWA の窓そのものとして開くので画面が乗っ取られる (docs/findings/2026-09-24-pwa-sandbox-top-navigation-matrix.md)。

sandbox を継いだ別窓は COOP が unsafe-none でない文書を読み込めないので、webui の頁の応答に COOP を付ければ塞がる。meta では付けられず、hosting に頼らないために webui 自身の SW が navigation の応答 (`request.mode === "navigate"`) に header を足す (SW が返した応答の COOP を WebKit が評価することは実測済み。実験の SW は test/manual/pwa-popups/outer/sw.js)。SW は install で skipWaiting、activate で clients.claim し、それ以外 (キャッシュ等) は持たない。

## 背景

DR-0005 §2.2 / §5 / §6 FV-Q6 FV-C1、docs/findings/2026-09-24-pwa-sandbox-top-navigation-matrix.md の検証を受けた対応。issue view-origin-per-open-and-registration-ledger (同じ閲覧の実装の一部として一緒にやってよい) と関連。

## 受け入れ条件

- [ ] webui の navigation 応答に `Cross-Origin-Opener-Policy: same-origin` が付く (SW 経由、playwright で確認)
- [ ] 初回訪問でも register → claim の後は別窓の navigation が SW を通る
- [ ] iPhone / iPad の PWA で S1 の閲覧 iframe から `_top` / `_parent` / `window.open` で scope 内 URL を開くと COOP のエラー窓になる (手動、test/manual/pwa-popups の S1 で D / F / H)
- [ ] 外部リンク (`_blank`) はアプリ内ブラウザで開く
- [ ] webui 自身の別窓 (端末 gateway、llm-gateway の login) と hyoui の iframe に影響が無い (COOP は opener を切るだけで、`noreferrer` 済み)
- [ ] SW の更新経路 (新 build で古い SW が残らない) を DESIGN に書く

## TODO

<!-- wip 時のみ -->

- [ ] {次に手を付けるサブタスク}
