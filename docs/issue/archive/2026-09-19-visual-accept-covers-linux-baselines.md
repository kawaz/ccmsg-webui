---
title: visual-accept が linux 基準の更新を含んでいない
status: resolved
category: task
created: 2026-09-19T13:11:21+09:00
last_read:
open_entered: 2026-09-19T13:11:21+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered: 2026-09-23T17:13:15+09:00
discard_reason:
pending_reason:
close_reason: ["done:justfile の visual-redraw-linux (workflow_dispatch を投げて待ち方を案内) と visual-accept-linux <run-id> (artifact 取り込み + manifest.ts write + snapshots commit) の 2 recipe に分けて自動化済み。visual-accept 末尾から両者へ誘導する"]
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

- [x] `just visual-accept` (または隣接 recipe) が linux 基準更新のフロー (workflow_dispatch → artifact 取り込み → manifest 書き換え) を自動化するか、手順を案内する
- [x] `visual-threshold-misses-removed-bar-items` の裁定を踏まえた `--update-snapshots` の扱いが反映されている

## 入れたもの (2026-09-20)

手作業 4 段を recipe 2 本にした。

| recipe | すること |
|---|---|
| `just visual-redraw-linux` | `gh workflow run ci.yml -f redraw_baselines=true` を default branch に投げ、待ち方 (`gh run watch <id> --exit-status`) と次の 1 行を出す |
| `just visual-accept-linux <run-id>` | artifact を snapshots の `linux/` に落とし、`manifest.ts write` で sha256 を書き直し、snapshots リポに linux の絵だけ commit する |

`just visual-accept` の末尾に「ここまでが darwin の基準、linux は push の後に上の 2 本」と出るようにした。

**1 本にまとめなかった理由**: CI が描けるのは **GitHub が既に持っている commit の姿**なので、linux の描き直しは push より後にしか走らせられない。`visual-accept` は push より前に走るものなので、同じ recipe に入れると順序が嘘になる。走り終わりを待たないのも同じ筋で、終わりを知っているのは GitHub の側 — 待ち方を出して `gh run watch` に任せる。

`--update-snapshots=all` は CI の redraw と `visual-accept` の両方に既に入っており (閾値の内側の差も書き直す)、`visual-threshold-misses-removed-bar-items` の追記が求めていた側になっている。
