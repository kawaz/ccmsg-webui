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

## 真因 (2026-09-19、diff artifact から)

diff は 2 つの独立した原因が重なっていた。どちらも「閾値 (`maxDiffPixelRatio: 0.002`) の内側に収まっている間は見えない」種類で、linux の字の描かれ方で片方が閾値を越えた時だけ落ちる。

### 1. 人の id が絵に出ていて、走行ごとに違う

アカウントの画面は同じ id を 3 か所に出す (「誰として」の行、「id」の行、passkey の説明文中の `ccmsg user passkey add <id>`)。この id は WebAuthn の user handle そのもの (契約 `UserId`) で、`ccmsg user create` が 16 byte を引き直して作る。絵を撮るブラウザは fixture が走るたびに登録し直すので、**毎回違う 22 文字**が 3 か所に出る。

覆われていなかったのは、時刻や host と違ってこれが「揮発値である」と気づかれていなかったため。darwin で通っていたのは決定的だったからではなく、3 か所ぶんの文字差が 0.002 (1280x800 で約 2048 px) に収まっていたから。darwin の基準画像 (`darwin/dark/account.png`) の id も、CI の actual の id も、どれ 1 つ一致していない。

**直し**: 3 か所に `.user-id` を付け、`shot()` の mask に足した (`src/ui/Account.tsx` / `test/visual/harness.ts`)。id は 22 文字で長さが決まっているので、`screenshot.css` の幅決め打ちは要らない。

fixture で固定する道は今の ccmsg には無い: `ccmsg user create` に id を指定する option が無く、admin の `user_create.user` は契約上「既に居る人」を指す (別の人を新しく作る id を名乗る場所ではない)。ccmsg 側に `--user` を足すかは ccmsg の裁定。

### 2. 左の一覧の待ち数バッジが、古い linux 基準にだけ写っている

`.waiting-badge` は既に mask 対象だが、mask は**出ている要素を塗るだけ**なので、片方に要素が無ければそこが丸ごと差分になる。

バッジが出ているのは linux 基準 (`linux/dark/account.png`) の方で、これは **v1.12.0 の描画のまま残っている**。当時は FAB から送る test が絵を撮るセッション (`SID`) 宛だったので、以降の画面に待ち数が残っていた。`e6d37f1` (v1.12.1) で送り先を `TALK_SID` に分けた時にこの経路は消えたが、**v1.12.1 の redraw では account.png が書き直されなかった**: `--update-snapshots` は値なしだと「合わなかった絵だけ」を書き直す (`changed`) ので、閾値の内側で違っていた account.png はそのまま v1.12.0 の絵が残った。

つまり 1 が 2 を隠していた: id の差で常に違っているのに閾値の内側なので落ちず、基準にも取り込まれない。

**直し**: `just visual-accept` と CI の `redraw_baselines` を `--update-snapshots=all` にした。既存 issue [visual-threshold-misses-removed-bar-items](2026-09-16-visual-threshold-misses-removed-bar-items.md) の「再描画は `=all` にすべきか」に対する更新側の答えで、**検出側 (閾値そのものの見直し) はそちらに残る**。

### 残っていること

- **linux 基準の撮り直しが要る**。1 の mask で描画が変わるので、`gh workflow run ci.yml -f redraw_baselines=true` → artifact 取り込み → `manifest.ts write` の手順 ([visual-accept-covers-linux-baselines](2026-09-19-visual-accept-covers-linux-baselines.md)) を通すまで linux の visual job は落ちる
- darwin の基準は `=all` で全枚撮り直した (47 枚が実際に変わった)。ただし **`files-code` / `files-markdown` / `file-word-candidates` の 3 画面は撮れていない**: ccmsg v1.7.0 の `file.read` がバイト列を範囲で返す形に変わり (契約 v2.8.0 / DR-0031)、webui 側が追随していないのでファイルの中身が出ない。これら 3 枚は v1.12.1 の描画のまま
