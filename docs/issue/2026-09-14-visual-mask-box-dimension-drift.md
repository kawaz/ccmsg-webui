---
title: session-search の基準画像が全件走行時だけずれる (マスク箱の寸法ゆらぎ)
status: open
category: bug
created: 2026-09-14T14:01:00+09:00
last_read:
open_entered: 2026-09-14T14:01:00+09:00
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

# session-search の基準画像が全件走行時だけずれる (マスク箱の寸法ゆらぎ)

## 概要

`just visual` の全 86 件走行で `[dark] session-search.visual.ts:12 打った言葉で過去の transcript が見つかり、押すと開く` が 1 度だけ失敗した (6399 px, 全体の 0.01)。同じ checkout で `bun x playwright test session-search.visual.ts --project=dark` を単独で走らせると通る。

## 背景

diff 画像で赤く出るのは 2 か所だけで、どちらも mask を掛けている箱そのもの:

- 接続バーの `.app-bar .meta` / `.footer`
- 探した結果の行 `.search-sessions[open] .hit .meta`

mask は中の文字を塗るだけで箱は残す仕様なので、箱の寸法が走行間で変わると一致しなくなる。`.hit .meta` は file の更新時刻を持ち、`.meta` は残り時間を持つので、どちらも文字数が変わりうる (例: 桁が 1 つ増減すると幅が変わる)。全件走行では単独走行より時間が経っているぶん、表記が別の桁に入りやすい。

切り分け済み:

- レイアウトを頁 scroll から本文ペイン scroll へ変えた変更 (v0.18.0 の後の commit) とは無関係。diff は一覧にも本文にも出ておらず、mask の箱だけ。
- `just visual-accept` の直後の全件検証で出たので、基準画像が古いことが理由ではない。

案 (裏取りしてから採否を決めてほしい):

- 幅が変わる文字を持つ要素は、mask ではなく寸法を固定する (min-width / 等幅) か、fixture 側で表記が動かない値にする
- あるいは、その行の時刻表示自体を絵から外す

## 受け入れ条件

- [ ] 全件走行を複数回繰り返しても session-search の visual test が安定して通る

## TODO

<!-- wip 時のみ -->

- [ ] {次に手を付けるサブタスク}
