---
title: visual: account (dark) が GitHub CI (Linux) で 1 件だけ flaky に落ちる
status: open
category: bug
created: 2026-09-19T21:11:52+09:00
last_read:
open_entered: 2026-09-19T21:11:52+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: webui
---

# visual: account (dark) が GitHub CI (Linux) で 1 件だけ flaky に落ちる

## 概要

main 251a3b6 (v1.12.1 + linux 基準) の GitHub CI visual job で
`screens.visual.ts` の account (dark) が 1 件だけ `toHaveScreenshot` で
落ちた。同じ commit の `--failed` 再実行では 154 passed で通った
(run 35441794045)。ログには `This socket has been ended by the other
party` が 2 回出ている。darwin では 3 回連続 0 failed。linux runner
固有の揺れで、真因は未特定。再実行で通ったことを直ったとは扱わない。

## 背景

- 対象: `screens.visual.ts` account (dark)
- 発生環境: GitHub Actions の linux runner のみ (darwin では未再現、3 回連続 0 failed)
- 再実行結果: `--failed` で再実行すると 154 passed (= 単発の揺れ)
- ログ中の手がかり: `This socket has been ended by the other party` が 2 回出現

## 受け入れ条件

- [ ] 次回 linux CI で同事象が発生した際、visual-diff artifact (期待 / 実際 / diff) を保存・取得する
- [ ] diff の中身 (行の増減か、位置ずれか、色差か) を確認して真因の手がかりを記録する
- [ ] 真因が特定できたら fix、特定できないうちは flaky と断定せず調査継続とする

## TODO

<!-- wip 時のみ -->
