---
title: visual test の閾値が要素まるごと削除の退行を検出できない
status: open
category: bug
created: 2026-09-16T09:58:55+09:00
last_read:
open_entered: 2026-09-16T09:58:55+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: self
---

# visual test の閾値が要素まるごと削除の退行を検出できない

## 概要

接続バーから「未接続」の語と「一覧」ボタンを消した変更 (2026-09-16) が、変更前の基準画像 `first-connect` のままで visual test を pass した。差分は文字とボタンの縁だけなので `maxDiffPixelRatio: 0.002` (1280x800 で約 2048 px) に収まる。つまりバー 1 行分の要素が丸ごと消えても閾値を越えず、visual test がこの種の退行を検出しない。

vite cache を消しても再現するので `visual-accept-stale-module` (docs/issue/2026-09-12-visual-accept-stale-module.md) とは別原因。

## 背景

`connection-bar-before-connect` (docs/issue/2026-09-16-connection-bar-before-connect.md) の修正検証中に発覚。基準画像とのピクセル差分比率だけで見ると、要素の有無の変化が小さな見た目差分に収まってしまい、閾値ベースの visual test は「壊れていない」と誤判定する。

## 受け入れ条件

- [ ] 画面ごとに `maxDiffPixelRatio` を下げるか、要素の有無は絵でなく DOM の assert で守るかを決める
- [ ] 決めた方針を該当 visual test に反映する

## TODO

<!-- wip 時のみ -->
