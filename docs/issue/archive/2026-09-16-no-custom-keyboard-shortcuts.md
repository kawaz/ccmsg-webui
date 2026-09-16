---
title: 独自キーボードショートカットを全廃し、ブラウザ標準ショートカットと衝突させない
status: resolved
category: bug
created: 2026-09-16T17:02:38+09:00
last_read:
open_entered: 2026-09-16T17:02:38+09:00
wip_entered:
blocked_entered:
pending_entered:
discarded_entered:
resolved_entered: 2026-09-16T17:42:38+09:00
discard_reason:
pending_reason:
close_reason: ["done:v1.5.0で SearchBar のdocument-level keydown(⌘F と /)を削除。残るのはFileWordのEscapeとリンクのmetaKey判定のみ。DESIGN に「打鍵はブラウザのもの」節を追加"]
blocked_by:
origin: kawaz
---

# 独自キーボードショートカットを全廃し、ブラウザ標準ショートカットと衝突させない

## 概要

v1.4.0 の見た目確認で発覚: ⌘F が webui の検索に奪われ、ブラウザ標準のページ内検索が使えない。
webui が定義しているキーボードショートカットを全部外す (⌘F を含む)。ショートカットは現時点では持たない。

## 背景

将来ショートカットを足す場合も既定は無効で、ブラウザ標準のショートカット (⌘F / ⌘K / ⌘L 等) と
被るキーは割り当てない、という方針を DESIGN に明記する。

## 受け入れ条件

- [ ] 検索欄にフォーカスが無い状態で ⌘F を押すとブラウザのページ内検索が開く
- [ ] `src/` に keydown で修飾キー付きのショートカットを捕まえるコードが残っていない (grep で確認)
- [ ] DESIGN に「既定は独自ショートカットを持たない / 将来追加時もブラウザ標準ショートカットと衝突するキーは割り当てない」旨を明記する
