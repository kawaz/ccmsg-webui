---
title: visual-accept が dev server の古い module を撮って基準が実は古いまま通ることがある
status: resolved
category: bug
created: 2026-09-12T09:21:39+09:00
last_read:
open_entered: 2026-09-12T09:21:39+09:00
wip_entered:
blocked_entered:
blocked_by:
discarded_entered:
resolved_entered: 2026-09-23T17:13:15+09:00
discard_reason:
pending_reason:
close_reason: ["done:test/visual/instance.ts の dev server に run 専用の vite cacheDir を渡し、古い module が配られる道を塞いだ。再現条件の特定は未了だが、受け入れ条件 2 (harness 側の手当て) で解消"]
origin: 自リポ TODO
---

# visual-accept が dev server の古い module を撮って基準が実は古いまま通ることがある

## 概要

`just visual-accept` で1度だけ、dev server が古い module を配って前の画面が撮れた
(2026-09-12)。accept が「基準画像は変わっていません」と言ったのに、次の run で
新しい DOM が撮れて差分が出た。基準を消して撮り直すことで解消した。

再発すると「直したのに基準が変わらない」形で症状が出るため気づきにくい。
原因未特定 (vite の変換キャッシュが怪しい)。

## 背景

当面の作法として、accept の後に snapshots リポ側の `git status` で差分が出て
いるか目視確認している。根本原因を潰すか、harness 側で鮮度を検知する仕組みが
要る。

## 受け入れ条件

- [ ] 再現条件を特定する (vite の cache dir を毎回消す / `--force` 起動 /
      dev server の起動タイミングのどれが効くか切り分け)
- [x] visual harness 側に「基準と同じ画像が撮れた時に module の鮮度を確認する」
      仕組みを入れるか、accept 前に vite cache を捨てる 1 行を追加する

## 直し方 (2026-09-20)

`test/visual/instance.ts` の dev server に `cacheDir: join(ROOT, "vite")` を渡した。変換の置き場が **その run のものになる**ので、前の run が残した物が配られる道が無くなる。`ROOT` は後で丸ごと消えるので後始末も要らず、開発者の `node_modules/.vite` (= `just dev` が使う方) には触らない。

**再現条件の特定はしていない**。2 度とも散発で、狙って再現できたことが無い。原因の切り分けより「外から古い物が来られない」形にする方が強い — 1 例の原因を潰しても、同じ置き場を共有している限り別の経路で同じ症状が出る。再現手順が手に入ったら、その時に切り分ける (受け入れ条件の 1 つ目は残してある)。

走る時間への影響は計った: `launcher.visual.ts --project=light` で 8.8 秒 (置き場を分ける前と体感差なし)。この repo の依存は小さいので、毎回の最適化が効いてこない。

## 追記

2026-09-16 の観測 (worker webui-theme-presets): 基準の撮り直しで差分が残る現象が
再現し、`node_modules/.vite` を消して撮り直すと解消。vite の変換キャッシュという
仮説を 1 例支持する。
