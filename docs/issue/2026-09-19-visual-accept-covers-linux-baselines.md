---
title: visual-accept が linux 基準の更新を含んでいない
status: open
category: task
created: 2026-09-19T13:11:21+09:00
last_read:
open_entered: 2026-09-19T13:11:21+09:00
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

# visual-accept が linux 基準の更新を含んでいない

## 概要

darwin で基準をフル撮り直して push すると、GitHub の visual job (linux 基準と比較) が 2 段階で落ちる:

1. linux 基準が古い
2. linux 基準を差し替えても、`test/visual/manifest.json` の linux sha256 が古い

`just visual-accept` の流れに linux 分を組み込みたい。例えば visual-accept の末尾で「linux 基準は `gh workflow run ci.yml -f redraw_baselines=true` で描かせ、artifact を取り込んでから manifest を書く」手順を recipe 化する。`gh run download` まで自動化できるか、少なくとも案内文を出す形にする。

## 背景

v1.11.0 で実際に踏んだ。workflow_dispatch (redraw_baselines) → artifact を `snapshots/linux` に入れて push → manifest.ts write → manifest を commit して push、の手作業 4 段で解消した。

合わせて redraw の `--update-snapshots` が閾値内の差を更新しない件は issue `visual-threshold-misses-removed-bar-items` の裁定に従う。

## 受け入れ条件

- [ ] `just visual-accept` (または隣接 recipe) が linux 基準更新のフロー (workflow_dispatch → artifact 取り込み → manifest 書き換え) を自動化するか、手順を案内する
- [ ] `visual-threshold-misses-removed-bar-items` の裁定を踏まえた `--update-snapshots` の扱いが反映されている
