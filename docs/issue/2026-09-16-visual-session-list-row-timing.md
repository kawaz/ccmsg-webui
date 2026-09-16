---
title: セッション一覧系 visual test が回によって 1〜3 件落ちる (行のタイミング差)
status: open
category: bug
created: 2026-09-16T22:51:31+09:00
last_read:
open_entered: 2026-09-16T22:51:31+09:00
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

# セッション一覧系 visual test が回によって 1〜3 件落ちる (行のタイミング差)

## 概要

`just visual` で、セッション一覧を含む画面 (sessions / session-pinned /
timeline-display / file-word-bubble) だけが回によって 1〜3 件落ちる。差分は
色ではなく一覧の行そのもの (行が 1 本ずれる)。撮り直した直後の回でも別の
画面が落ちるので収束しない。

## 背景

member 色の作業中に観測。commit を 1 つずつ載せて確認しても 3 つとも通る
ため、色の変更とは無関係と判明している。起動中の run が端末の一覧
(DR-0026 の terminals) から遅れて届くタイミング差が仮説 (未確定)。

test-integrity により flaky 扱いにしない: 一覧が「起動中の run の反映まで
済んだ」事象を待ってから撮る形に直す。待つ事象はテストコードに明示し、
timeout 延長では対処しない。

## 受け入れ条件

- [ ] 一覧が起動中の run の反映を待ってから screenshot を撮る形に修正されている (待つ事象がテストコードに明示されている)
- [ ] timeout 延長のみでの対処になっていない
- [ ] 全件走行 10 回で sessions / session-pinned / timeline-display / file-word-bubble の 4 画面が pass する

## TODO

<!-- wip 時のみ -->

- [ ] {次に手を付けるサブタスク}
