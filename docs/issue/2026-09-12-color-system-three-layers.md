---
title: 色システムを 3 層構造 (入力 / scale / 意味名) で v2 webui に導入する
status: open
category: design
created: 2026-09-12T07:22:44+09:00
last_read:
open_entered: 2026-09-12T07:22:44+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: v1 (plugin claude-ccmsg) DR-0033-webui-color-system.md からの移管
---

# 色システムを 3 層構造 (入力 / scale / 意味名) で v2 webui に導入する

## 概要

v1 (plugin claude-ccmsg) の `docs/decisions/DR-0033-webui-color-system.md` (Proposed、「webui へ移管」のまま未着手) を v2 webui (このリポ) に取り込む。

設計は 3 層:

- **層 0 = 入力**: brand h(ue) / neutral tint / 状態色 h ×4 / 固定スロット h ×2 / light|dark
- **層 1 = scale**: 色相ごとに 12 段の scale (段番号と役割の対応を全色相で共有、Radix Colors の考え方)
- **層 2 = 意味名**: `--bg` / `--bg-hover` / `--border` / `--fg-muted` / `--accent` / `--fg-error` 等

コンポーネント CSS は意味名だけを参照し、算出は CSS の相対色構文で行う (JS で色を計算しない)。段表 (L / C の設計値) はテーマエディタから触らせず、コントラスト保証を構造に閉じ込める。

## 背景

現状 (v0.6.0) の `src/app.css`:

- 意味名トークン 10 個 + light/dark の 2 段
- 生 hex 24 種
- `rgb()` 1 箇所

v1 の DR 本文は `~/.claude-personal/plugins/cache/claude-ccmsg/claude-ccmsg/0.152.4/docs/decisions/DR-0033-webui-color-system.md` (plugin cache に置かれており消える前に必要部分をこのリポの DR に写す必要がある)。

### 出典の訂正

v1 の設計は v1 リポ `~/.local/share/repos/github.com/kawaz/claude-ccmsg/main/` の以下 3 文書で、v1 の `color-system` workspace で作られ全て v1 main に land 済み (2026-09-12 確認)。CSS 実装は未着手。plugin cache のコピーではなくこのリポを出典にする。

- `docs/decisions/DR-0033-webui-color-system.md` (199 行)
- `docs/research/2026-09-08-color-theme-derivation.md` (319 行、導出の研究)
- `docs/design/design-tokens.md` (167 行、トークン規約)

取り込み時は 3 文書を v2 webui の `docs/decisions/` / `docs/design/` に写し、v2 の現状 (トークン 10 個、hex 24 種) に合わせて棚卸しを引き直す。

### 段階

1. 意味名の語彙表を `docs/design/color-tokens.md` に置き、hex を全て層 2 経由に置き換える (visual 基準 14 枚で差分確認)
2. 層 1 の scale と層 0 の入力を導入
3. テーマエディタ (動いている画面を見たまま触れるフローティング UI、テーマの丸ごと入れ替え) は別段 (本 issue のスコープ外)

### 決めること (未確定の設計判断)

- 色空間 (oklch 一本化でよいか)
- member / say の seed 由来の色相をどの層に置くか
- Shiki のハイライト色 (light/dark 両持ち) を層 2 に接続するか

## 位置づけの訂正 (kawaz 2026-09-12)

v1 の 3 文書は「設計済み」ではなく、アイデアを話して少し揉んだ段階。v2 が始まる時期だったので続きは v2 側で揉む予定だった。したがって本 issue は「持ち込んで実装する」ではなく「v1 の案 (3 層構造、段番号の共有、CSS 相対色構文、テーマエディタ) を出発点に v2 で設計の続きを kawaz と詰める」から始める。実装の段階分けは設計が固まってから。

## 受け入れ条件

- [ ] v1 DR-0033 の必要部分をこのリポの DR として書き起こし済み
- [ ] 段階 1 (意味名語彙表 + hex 全廃 + visual diff 確認) が完了している
- [ ] 「決めること」の 3 点に対する判断が記録されている

## TODO

<!-- wip 時のみ -->
