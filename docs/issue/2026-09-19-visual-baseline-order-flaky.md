---
title: visual の基準撮り直し後、一覧の並びが落ち着く前の絵が混ざる
status: open
category: bug
created: 2026-09-19T17:23:05+09:00
last_read:
open_entered: 2026-09-19T17:23:05+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered:
discard_reason:
pending_reason:
close_reason:
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

## 仮説 (裏取り未了)

`shot()` が撮る前に通るのは `listSettled` (= `.pane-list` の `data-settled`) までで、これは「snapshot が届いたか」しか言わない。並べ方の既定は「人が話しかけた順」で、その時刻は instance が transcript を読み終えて初めて決まるので、`data-settled` が立った後にもう一度並びが入れ替わる窓がある。

既存の並び待ち `settledOrder()` は「先頭の行が『束 0 を片付ける』」を待つが、**この 3 ファイルが走る時点では成り立たない** (status.visual.ts の先頭 test では先頭が「追記を見る」のまま変わらず、5s で timeout する)。実際に 3 ファイルへ `settledOrder()` を足して試したところ、status の 1 本目が light/dark 両方で決定的に落ちた。つまり `settledOrder` は run の早い時点でしか使えない述語になっている。

## やっていないこと

`shot()` 側の待ちを作り直す (= 並びが 2 frame 続けて同じであることを待つ等) は、絵を撮る全画面に効く変更なので手を付けていない。閾値 (`maxDiffPixelRatio`) を緩めるのも、並びの入れ替わりを吸収してしまうので採らない。

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
   と同じ症状で、据え置き入力欄が消えて本文が高くなった分だけ出やすくなった

### 試して**駄目だった**手 (繰り返さないため)

- `shot()` に「一覧の行の名前が 2 frame 続けて同じ」を待つ関数を足す →
  **悪化した** (落ちる件数が 10 → 27 に増え、本文側の screens がまとめて落ちた)。
  待ちを 1 つ足すと撮る瞬間がずれ、別の未確定な所に当たる。撤回済み
- 3 ファイルに既存の `settledOrder()` を足す → status の 1 本目で
  「先頭の行が『束 0 を片付ける』」が成り立たず 5s timeout。あの述語は run の
  早い時点でしか使えない。撤回済み

### 次に当たる所

`shot()` の待ちを 1 つずつ足すのではなく、**撮る前に「instance がもう何も
push しない」と言える状態**を作る方向。`data-settled` はそこまで言っていない。
