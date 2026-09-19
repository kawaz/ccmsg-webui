---
title: visual の基準撮り直し後、一覧の並びが落ち着く前の絵が混ざる
status: resolved
category: bug
created: 2026-09-19T17:23:05+09:00
last_read:
open_entered: 2026-09-19T17:23:05+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered: 2026-09-19T20:58:12+09:00
discard_reason:
pending_reason:
close_reason: ["done:真因 3 つ全部潰した (377120b9)、just visual 3 回連続 0 failed (154 passed x3)、残る FAB 枠 1px は別 issue visual-fab-window-frame-1px-misaligned"]
blocked_by:
origin: ccmsg
---

# visual の基準撮り直し後、落ち着く前の絵が混ざる (一覧の並び / 本文の錨)

## 概要

## 現象

`bun x playwright test --update-snapshots=all` → `bun test/visual/manifest.ts write` → `just visual` の手順で、`just visual` が走るたびに 0〜7 件失敗する。失敗する顔ぶれは走るたびに変わり、light の時も dark の時もある。同じ基準画像に対する 2 回続けての `just visual` で、片方が 7 failed、もう片方が 0 failed になった実測あり (= 基準が間違っているのではなく、撮る側が揺れている)。

## 再現

```
cd /Users/kawaz/.local/share/repos/github.com/kawaz/ccmsg-webui/main
bun x playwright test --update-snapshots=all
bun test/visual/manifest.ts write
just visual   # 何度か繰り返す
```

## 出る顔ぶれ (観測)

いつも同じ 3 ファイルのかたまり:

- `test/visual/status.visual.ts` (`session-status.png` / `session-dump.png`)
- `test/visual/terminals.visual.ts` (`terminals.png` / `terminal-one.png` / `terminal-starting.png` / `terminal.png`)
- `test/visual/translate.visual.ts` (`timeline-translated.png`)

差分はどれも **サイドバーのセッション一覧の行の並び** だけ (3000〜6000px、全体の 1%)。メインコンテンツ側は一致している。

## 真因 (実測)

「並び順が `data-settled` の後にもう一度入れ替わる」という仮説は**外れ**だった。送信後 12 秒まで 1 秒刻みで一覧を読んでも、セッションの行の順は 1 度も変わらなかった。

真因は 3 つあり、全部潰した結果、同じ基準に対する `just visual` が 3 回中 2 回 0 failed まで来た (残り 1 回は別 issue [visual-fab-window-frame-1px-misaligned](./2026-09-19-visual-fab-window-frame-1px-misaligned.md) の FAB の枠)。

1. **一覧の行が 1 つ遅れて増える**。起動中のハーネスの行 (`claude`) が頁を開いて約 1 秒後に別 topic から届く。`listSettled` (`listed && terminalsListed`) はそこまで言っていない。対処: 出揃うべき行の名前の集合を宣言し、ブラウザを立てた直後に 1 回だけその集合が揃うまで待つ (`harness.ts` の `rowsArrived`)。`shot()` ではなく fixture に置くのは、区画を畳む test や行を留める test が後から見え方を変えるため
2. **並び順が共有ブラウザに残っていた**。`session-actions.visual.ts` の「並び順はアイコンから開いて選ぶ」が並びを「接続した順」に変えたまま出ていたので、以降に撮る画面ぜんぶが別の並びで焼かれ、しかも「接続した順」は同じ瞬間に名乗ったセッションどうしの前後が決まらない。対処: test の最後に「人が話しかけた順」へ戻す
3. **送った 1 通の待ち数バッジが遅れて出る**。`actions.visual.ts` が送った後、宛先の行に出る待ち数を待たずに出ていたので、後から立つブラウザが snapshot でそれを受け取る前に撮ることがあった。対処: 送信後にバッジが `1` になるまで待つ

## 出所

FAB の作り直し (口に付く非モーダルの窓 / 掴んで動かす、DR-0003 §2.7) で基準を全面撮り直した時に踏んだ。**FAB の変更が原因ではない**: 差分はサイドバーの行順だけで FAB の写っている領域は一致しており、同じ基準に対する連続 2 回の `just visual` で結果が割れる。

## 背景

{なぜ必要か、どこから来た要望か}

## 受け入れ条件

- [ ] {完了の判定基準}


## 追記 (2026-09-19、FAB 一本化の後)

据え置き Composer を外した後に撮り直したところ、**揺れる範囲が本文側にも広がった**。
同じ基準に対する連続 2 回の `just visual` で、落ちる顔ぶれが 10 件 (light のみ) →
12 件 (light と dark に分かれる) と変わる。基準が誤っているのではなく、撮る側が
揺れていることの確認はこれで 3 回目。

### 揺れの中身は 2 種類ある

1. **サイドバーの行の並び** (`status` / `terminals` / `translate`) — 上に書いた分
2. **本文の縦位置** (`screens` の `timeline` / `timeline-fold-open` /
   `timeline-raw-record` / `timeline-search` / `conversation` / `notification` /
   `file-word-bubble`、`phase` / `account`) — 差分画像では transcript が丸ごと
   1 item 分ほど上下にずれている。`shot()` が通る `stillness()` は本文の箱の
   `scrollTop` が 2 frame 続けて同じであることを待つが、最後の item の高さが
   測り直される frame がその後に来ると、待ち終えた後に錨が動く。
   既存の [anchor-snapshot-one-frame-stale](./2026-09-11-anchor-snapshot-one-frame-stale.md)
   と同じ症状で、据え置き入力欄が消えて本文が高くなった分だけ出やすくなった。
   **これは別原因**で、仮想リスト撤去の取り込みで解消済み: transcript が末尾から
   開いていなかったことと、`content-visibility: auto` の見積もり高さの測り直しが
   既に置いた view の下で中身を動かしていたこと。撮影時の scrollTop / scrollHeight /
   行数を 2 走行で比べて差分 0 行を確認済み

### 試して**駄目だった**手 (繰り返さないため)

- `shot()` に「一覧の行の名前が 2 frame 続けて同じ」を待つ関数を足す →
  **悪化した** (落ちる件数が 10 → 27 に増え、本文側の screens がまとめて落ちた)。
  待ちを 1 つ足すと撮る瞬間がずれ、別の未確定な所に当たる。撤回済み
- 3 ファイルに既存の `settledOrder()` を足す → status の 1 本目で
  「先頭の行が『束 0 を片付ける』」が成り立たず 5s timeout。あの述語は run の
  早い時点でしか使えない。撤回済み
- `shot()` に「一覧の行の名前が 5 frame 続けて同じ」を待つ関数を足す →
  落ちる一族が light から dark へ移っただけで件数は同じ。1 秒後に届くものに
  frame 単位の待ちは届かない。撤回済み
