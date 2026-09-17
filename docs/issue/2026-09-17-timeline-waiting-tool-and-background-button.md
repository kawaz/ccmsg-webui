---
title: TL に同期ツール実行中の待機表示と Background ボタンを追加
status: open
category: request
created: 2026-09-17T14:35:14+09:00
last_read:
open_entered: 2026-09-17T14:35:14+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: kawaz
---

# TL に同期ツール実行中の待機表示と Background ボタンを追加

## 概要

同期的な Agent / Bash ツールを実行中で待っている状態が TL 上で分かるようにする。

1. **表示**: transcript の tool_use に対応する tool_result がまだ無い item を
   「実行中」と判定し、`waiting… 5m21s` の経過時間を小さく表示する
   (item の時刻から導出、RelativeTime の仕組みに乗せる)。
2. **Background ボタン**: 実行中の item の横に置き、押すと daemon が hyoui
   経由でその端末 (DR-0026 の terminals、sid と pid で結ぶ) に Ctrl+B を送って
   TUI をバックグラウンド化し会話可能にする。
3. **確認事項**:
   - Ctrl+B が Agent 呼び出しにも効くか実機で確かめる (効かなければ Bash
     だけに出す)。
   - webui から端末へ入力を送る op は契約に人の role 限定で足す必要が
     あるか (既存の hyoui 連携の op を確認)。

## 背景

kawaz からの起票 (2026-09-17)。アクション体系 (DR-0003) の 1 アクションとして
定義する。状態機械 (DR-0004) とアクション体系の land 後に着手する。

## 受け入れ条件

- [ ] tool_result 未着の item が TL 上で「実行中」と判定され、経過時間が
      `waiting… 5m21s` の形式で小さく表示される
- [ ] 実行中の item に Background ボタンが表示され、押下で daemon が hyoui
      経由で対象端末に Ctrl+B を送る
- [ ] Ctrl+B が Agent 呼び出しにも効くかを実機確認し、効かない場合は Bash
      のみにボタンを出す設計へ反映する
- [ ] webui → 端末入力の op に人の role 限定が必要か契約側で確認し、必要なら
      契約に反映する
- [ ] DR-0003 のアクション体系に本アクションとして定義される

## TODO

<!-- wip 時のみ -->
