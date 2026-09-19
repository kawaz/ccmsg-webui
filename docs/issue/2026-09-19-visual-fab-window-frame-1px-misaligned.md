---
title: 口の窓と本文の枠が、同じ幾何のまま 1px 違う所に焼ける
status: open
category: bug
created: 2026-09-19T21:40:00+09:00
last_read:
open_entered: 2026-09-19T21:40:00+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
blocked_by:
origin: ccmsg-webui
---

# 口の窓と本文の枠が、同じ幾何のまま 1px 違う所に焼ける

## 概要

`actions.visual.ts` の「FAB は掴んで動かせて、窓ごと付いてくる」が、全走行のうち 3 回に 1 回ほど `actions-fab-moved.png` で落ちる。**要素の座標は毎回まったく同じ**で、違うのは境界線がどちらの行に焼かれるかだけ。

## 現象 (実測)

差は 3744 画素 (全体の 0.01、閾値 `maxDiffPixelRatio: 0.002` を超える)。差の出ている場所を数えると、**線だけ**:

```
差 3744 画素 bbox=(323,48)-(1267,761)  差のある行 690
多い行: y761:939  y438:554  y596:554  y439:12  y595:12  y760:10  y49:8 …
```

- `y438` / `y596` = 口の窓 (`.fab-window`) の上下の枠 (窓は y=436.61、高さ 161.39 に居る)
- `y761` と、x=323 / x=1267 に沿って縦に伸びる細い差 = 本文ペインの枠
- どれも **1 行ぶんの横線・1 列ぶんの縦線**で、面の中身は一致している

## 幾何は揺れていない

同じ操作を 6 回繰り返して読んだ値は完全に一致する:

```
[h] 掴んだ後 0: win=504.00,436.61 560.00x161.39 area=56.00 focus=DIV badge=[1]
[h] 掴んだ後 1: win=504.00,436.61 560.00x161.39 area=56.00 focus=DIV badge=[1]
… 6 回とも同じ
```

置いた所も同じ (`--fab-left=1016px --fab-top=606px`、8 回とも同値)。だから**辺からの距離の丸め (`toEdges` の `Math.round`) でも、pointer の座標でも、visual viewport の丸めでもない**。

残るのは**小数位置に置かれた枠を、どちら側の画素に寄せて焼くか**。窓の上端 436.61 も高さ 161.39 も小数で、境界線はちょうど画素の境に乗っていない。単独で走らせると 5 回とも通り、全走行の中でだけ出るので、合成レイヤの持ち上がり方など描画側の都合で寄せ先が変わっていると見ている (ここは未確認)。

## 当たっていない所

- 小数を無くす方向 (口の窓の高さを整数に寄せる。高さは書く所の `field-sizing: content` から来ていて、行の高さが小数のまま窓の高さに乗っている)
- 描画側の都合を確かめる (合成レイヤの持ち上がりを `will-change` 等で固定すると寄せ先が決まるか)

閾値を緩める手は採らない — 1 item ぶんの layout のずれを吸収してしまう幅が要る。

## 再現

```
cd /Users/kawaz/.local/share/repos/github.com/kawaz/ccmsg-webui/main
just visual   # 3 回に 1 回ほど actions-fab-moved.png (dark) が落ちる
```

単体 (`bun x playwright test actions --project=dark -g "掴んで動かせて"`) では再現しない。

## 出所

仮想リスト撤去の取り込みで基準を撮り直した時、他の揺れ (本文の縦位置 / 一覧の行) を潰した後に最後まで残ったもの。撤去とも FAB の置き場の記憶とも独立している。

## 受け入れ条件

- [ ] 同じ基準に対する `just visual` が 3 回続けて 0 failed
- [ ] 枠の焼かれる先が揺れない理由を、幾何か描画かのどちらかで言えている
