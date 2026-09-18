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

## 追記: 同根の観測 (2026-09-16、統括)

CI の `redraw_baselines` と `just visual-accept` は `bun x playwright test --update-snapshots` を値なしで呼んでいて、Playwright ではこれは `changed` (閾値を越えた時だけ基準を書き直す) になる。v1.3.1 で再描画した linux 基準は 80 枚すべて既存と同一 md5 で、`first-connect` の linux 基準は v0.17.0 のまま。閾値内の変化は検出されないだけでなく基準にも取り込まれず、次に閾値を越えた時に複数版の差分がまとめて出る。再描画は `--update-snapshots=all` で全枚を書き直すべきか、閾値の見直しと合わせて決める。

## 追記: 2026-09-16 (member 色の導入時)

吹き出しの色が変わった timeline / translate / conversation は閾値 0.002 を下回って `just visual-accept` (`--update-snapshots` の changed 動作) では基準に入らず、設定画面の 4 枚しか書き換わらなかった。`playwright test --update-snapshots=all` で全面的に書き直して解消。色だけの変更は今の閾値では検出も更新もされない、の 2 例目。

## 追記: 2026-09-18 (DR-0004 の再認証ダイアログ)

再認証ダイアログに「閉じる」ボタン 1 個を足した変更で `reauth.png` の基準画像が閾値 0.002 (1280x800 で約 2048px) に飲まれ、`just visual-accept` (= `--update-snapshots` の changed 動作) でも更新されなかった。基準画像は「閉じる」が無い古い絵のまま pass していた。基準画像 2 枚 (darwin/light, darwin/dark の `reauth.png`) を rm してから撮り直して正した。ボタン 1 個分が飲まれる 3 例目で、要素の有無は DOM の assert で守る方針の根拠が増えた (今回の visual test は dialog 内のボタンを role で押す assert を併せて持っている)。
